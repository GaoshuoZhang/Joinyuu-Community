import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma, RedemptionOrder } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { RedisService } from '../../../common/redis/redis.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import { CreateOrderDto } from './dto/create-order.dto'
import { ReviewOrderDto } from './dto/review-order.dto'

/* 重复点击去重标记 TTL（秒）：同一用户对同一商品短时间内多次提交判定为重复 */
const ORDER_DEDUPE_TTL = 3

/* 券码默认有效期（天）：商品未配置 validDays 时兜底 */
const DEFAULT_VOUCHER_VALID_DAYS = 30

/* 积分商城（M2-R R2，/api/app/mall + /api/app/me/orders）：
 * 商品列表/详情（mallOpen 开关 + on/restock 均可见，库存为 0 时前端展示售罄）、
 * 兑换下单（单事务：校验库存→扣积分+流水→扣库存→建单，physical 必带地址快照 /
 * voucher 签发券码并按商品 validDays 计算有效期）、取消（仅实物待发货，退积分+回补库存）、
 * 券码核销（过期拦截）、确认收货、订单评价。 */
@Injectable()
export class AppMallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly redis: RedisService,
    private readonly notify: NotificationService,
  ) {}

  /* ---------- 商品 ---------- */

  async listGoods(page: number, pageSize: number, category?: string, keyword?: string) {
    await this.assertMallOpen()
    const where: Prisma.MallGoodsWhereInput = {
      status: { in: ['on', 'restock'] },
      deletedAt: null,
    }
    const kw = keyword?.trim()
    if (kw) where.OR = [{ name: { contains: kw, mode: 'insensitive' } }]
    if (category) where.category = category

    const [rows, total] = await Promise.all([
      this.prisma.mallGoods.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.mallGoods.count({ where }),
    ])
    return { list: rows.map((g) => this.toGoodsDto(g)), total }
  }

  async goodsDetail(id: string) {
    await this.assertMallOpen()
    const goods = await this.prisma.mallGoods.findFirst({
      where: { id, deletedAt: null, status: { in: ['on', 'restock'] } },
    })
    if (!goods) throw new NotFoundException('商品不存在')
    return this.toGoodsDto(goods)
  }

  /* ---------- 下单 ---------- */

  async createOrder(uid: string, dto: CreateOrderDto): Promise<{ id: string; remainingPoints: number }> {
    await this.assertMallOpen()
    const goods = await this.prisma.mallGoods.findFirst({
      where: { id: dto.goodsId, deletedAt: null },
    })
    /* 缺货商品保持可见（restock），下单由事务内库存条件拦截为「库存不足」 */
    if (!goods || (goods.status !== 'on' && goods.status !== 'restock')) throw new NotFoundException('商品不存在')

    const user = await this.prisma.user.findUnique({ where: { uid } })
    if (!user) throw new BadRequestException('用户不存在')
    if (user.points < goods.points) throw new BadRequestException('积分不足')

    let address: { name: string; phone: string; region: string; detail: string } | null = null
    /* 实物商品发货方式分流：商品支持自提+邮寄时下单必须显式选择；仅支持一种时按唯一方式兜底 */
    let shippingMethod: 'pickup' | 'delivery' | null = null
    if (goods.fulfillment === 'physical') {
      const methods = goods.shippingMethods ?? []
      const supportsPickup = methods.includes('pickup')
      const supportsDelivery = methods.includes('delivery') || methods.length === 0
      if (supportsPickup && supportsDelivery) {
        if (dto.shippingMethod !== 'pickup' && dto.shippingMethod !== 'delivery') {
          throw new BadRequestException('请选择自提或邮寄')
        }
        shippingMethod = dto.shippingMethod
      } else {
        shippingMethod = supportsPickup ? 'pickup' : 'delivery'
      }
      if (shippingMethod === 'delivery') {
        if (!dto.addressId) throw new BadRequestException('请先选择收货地址')
        const addr = await this.prisma.address.findFirst({
          where: { id: dto.addressId, userId: uid },
        })
        if (!addr) throw new BadRequestException('请先选择收货地址')
        address = { name: addr.name, phone: addr.phone, region: addr.region, detail: addr.detail }
      }
    }

    /* 防重复提交（同一用户同一商品短时间窗口） */
    const dedupeKey = `mall:order:dp:${uid}:${dto.goodsId}`
    if (!(await this.redis.acquireFlag(dedupeKey, ORDER_DEDUPE_TTL))) {
      throw new ConflictException('请勿重复提交')
    }

    let orderId = ''
    let remaining = 0
    try {
      await this.prisma.$transaction(async (tx) => {
        /* 条件扣库存（并发安全）：库存不足则不扣并报错 */
        const stockUpd = await tx.mallGoods.updateMany({
          where: { id: dto.goodsId, status: { in: ['on', 'restock'] }, deletedAt: null, stock: { gt: 0 } },
          data: { stock: { decrement: 1 }, redeemedCount: { increment: 1 } },
        })
        if (stockUpd.count === 0) throw new BadRequestException('库存不足')
        /* 库存售罄时同步状态为 restock，保证后台列表与客户端「售罄」一致 */
        await tx.mallGoods.updateMany({
          where: { id: dto.goodsId, status: 'on', stock: 0 },
          data: { status: 'restock' },
        })

        /* 事务内原子条件扣减积分：余额不足则整体回滚，避免并发下的丢失更新（超兑） */
        const deducted = await tx.user.updateMany({
          where: { uid, points: { gte: goods.points } },
          data: { points: { decrement: goods.points } },
        })
        if (deducted.count !== 1) throw new BadRequestException('积分不足')
        const afterDeduct = await tx.user.findUnique({ where: { uid }, select: { points: true } })
        remaining = afterDeduct?.points ?? 0
        await tx.pointsRecord.create({
          data: {
            id: await this.ids.next('PT', tx),
            userId: uid,
            delta: -goods.points,
            balance: remaining,
            reason: `兑换 ${goods.name}（${goods.id}）`,
            at: formatNow(),
            operator: '系统',
            source: 'redemption',
          },
        })

        orderId = await this.ids.next('RO', tx)
        await tx.redemptionOrder.create({
          data: this.buildOrderData(orderId, uid, user.nickname, goods, dto, address, shippingMethod),
        })
      })
    } catch (error) {
      await this.redis.delCache(dedupeKey)
      throw error
    }

    await this.notify.pushNotice(uid, {
      type: 'mall',
      title: '兑换成功',
      content: `您已成功兑换「${goods.name}」，消耗 ${goods.points} 积分。`,
    })
    return { id: orderId, remainingPoints: remaining }
  }

  /* ---------- 我的订单 ---------- */

  async myOrders(uid: string) {
    const rows = await this.prisma.redemptionOrder.findMany({
      where: { userId: uid, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return { list: rows.map((o) => this.toOrderDto(o)), total: rows.length }
  }

  /** 订单详情：直接按 userId 收敛查询，非本人/不存在一律 404（不暴露存在性）；
   * 与列表项复用同一 toOrderDto，保证形状一致、免去客户端本地 find。 */
  async myOrder(uid: string, id: string) {
    const order = await this.prisma.redemptionOrder.findFirst({
      where: { id, userId: uid, deletedAt: null },
    })
    if (!order) throw new NotFoundException('订单不存在')
    return this.toOrderDto(order)
  }

  /* ---------- 订单履约 ---------- */

  async cancelOrder(uid: string, id: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.userId !== uid) throw new ForbiddenException('无权操作该订单')
    if (order.fulfillment !== 'physical') throw new ConflictException('该订单不可取消')
    const now = formatNow()
    await this.prisma.$transaction(async (tx) => {
      /* 先以状态条件抢占取消权；并发请求只有一个能进入退款逻辑。 */
      const claimed = await tx.redemptionOrder.updateMany({
        where: { id, userId: uid, fulfillment: 'physical', status: 'pending_shipment' },
        data: { status: 'cancelled', cancelledAt: now, cancelReason: '用户取消订单，积分已原路退回' },
      })
      if (claimed.count !== 1) throw new ConflictException('仅待发货订单可取消')

      /* 退积分（原子自增 + 正流水，source=redemption） */
      const refunded = await tx.user.update({
        where: { uid },
        data: { points: { increment: order.points } },
        select: { points: true },
      })
      const newBalance = refunded.points
      await tx.pointsRecord.create({
        data: {
          id: await this.ids.next('PT', tx),
          userId: uid,
          delta: order.points,
          balance: newBalance,
          reason: `订单取消退回积分（${order.id}）`,
          at: now,
          operator: '系统',
          source: 'redemption',
        },
      })
      /* 回补库存：原子自增，售罄商品回补后恢复上架（保持客户端可见与可下单一致） */
      const goods = await tx.mallGoods.findUnique({ where: { id: order.goodsId }, select: { status: true } })
      if (goods) {
        const restoreStatus = goods.status === 'restock' ? { status: 'on' } : {}
        await tx.mallGoods.update({
          where: { id: order.goodsId },
          data: { stock: { increment: 1 }, redeemedCount: { decrement: 1 }, ...restoreStatus },
        })
      }
    })

    await this.notify.pushNotice(uid, {
      type: 'mall',
      title: '订单已取消',
      content: `您已取消「${order.goodsName}」的兑换订单，${order.points} 积分已原路退回。`,
    })
    return { code: 0 }
  }

  async useOrder(uid: string, id: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.userId !== uid) throw new ForbiddenException('无权操作该订单')
    if (order.status !== 'pending_use') throw new ConflictException('该订单不可核销')
    if (order.fulfillment === 'voucher' && order.voucherExpiresAt && order.voucherExpiresAt <= formatNow()) {
      throw new ConflictException('券码已过期，无法核销')
    }
    const updated = await this.prisma.redemptionOrder.updateMany({
      where: { id, userId: uid, status: 'pending_use' },
      data: { status: 'finished', usedAt: formatNow(), finishedAt: formatNow() },
    })
    if (updated.count !== 1) throw new ConflictException('该订单不可核销')
    return { code: 0 }
  }

  async confirmOrder(uid: string, id: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.userId !== uid) throw new ForbiddenException('无权操作该订单')
    if (order.status !== 'shipped') throw new ConflictException('仅已发货订单可确认收货')
    const updated = await this.prisma.redemptionOrder.updateMany({
      where: { id, userId: uid, status: 'shipped' },
      data: { status: 'finished', finishedAt: formatNow() },
    })
    if (updated.count !== 1) throw new ConflictException('仅已发货订单可确认收货')
    return { code: 0 }
  }

  async reviewOrder(uid: string, id: string, dto: ReviewOrderDto): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.userId !== uid) throw new ForbiddenException('无权操作该订单')
    if (order.status !== 'finished') throw new ConflictException('仅已完成的订单可评价')
    if (order.rating != null) throw new ConflictException('该订单已评价')
    const updated = await this.prisma.redemptionOrder.updateMany({
      where: { id, userId: uid, status: 'finished', rating: null },
      data: { rating: dto.rating, reviewComment: dto.comment ?? null },
    })
    if (updated.count !== 1) throw new ConflictException('该订单已评价')
    return { code: 0 }
  }

  /* ---------- 内部工具 ---------- */

  private async assertMallOpen(): Promise<void> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (cfg && cfg.mallOpen === false) throw new BadRequestException('积分商城暂未开放')
  }

  private buildOrderData(
    id: string,
    userId: string,
    userName: string,
    goods: { id: string; name: string; points: number; fulfillment: string; validDays: number | null; pickupAddress: string | null },
    dto: CreateOrderDto,
    address: { name: string; phone: string; region: string; detail: string } | null,
    shippingMethod: 'pickup' | 'delivery' | null,
  ): Prisma.RedemptionOrderCreateInput {
    const now = formatNow()
    const fulfillment = goods.fulfillment
    const physical = fulfillment === 'physical'
    const data: Prisma.RedemptionOrderCreateInput = {
      id,
      user: { connect: { uid: userId } },
      userName,
      goodsId: goods.id,
      goodsName: goods.name,
      points: goods.points,
      fulfillment,
      status: physical ? 'pending_shipment' : 'pending_use',
      createdAt: now,
      note: dto.remark?.trim() || null,
    }
    if (physical && shippingMethod) {
      data.shippingMethod = shippingMethod
      /* 自提：快照商品自提地址（后续商品改址不影响已生成订单）；不写收货地址字段 */
      if (shippingMethod === 'pickup') data.pickupAddress = goods.pickupAddress
    }
    if (physical && shippingMethod === 'delivery' && address) {
      data.recipientName = address.name
      data.recipientPhone = address.phone
      data.address = address.region ? `${address.region} ${address.detail}` : address.detail
      data.addressId = dto.addressId ?? null
    }
    if (fulfillment === 'voucher') {
      const validDays = goods.validDays && goods.validDays > 0 ? goods.validDays : DEFAULT_VOUCHER_VALID_DAYS
      data.voucherCode = generateVoucherCode()
      data.voucherExpiresAt = this.addDaysTime(now, validDays)
    }
    return data
  }

  private toGoodsDto(g: {
    id: string
    name: string
    coverUrl: string | null
    category: string
    fulfillment: string
    points: number
    stock: number
    validDays: number | null
    description: string
    shippingMethods: string[]
    pickupAddress: string | null
  }) {
    return {
      id: g.id,
      name: g.name,
      coverUrl: g.coverUrl ?? undefined,
      category: g.category,
      fulfillment: g.fulfillment,
      points: g.points,
      pointsCost: g.points,
      stock: g.stock,
      validDays: g.fulfillment === 'voucher' ? g.validDays ?? DEFAULT_VOUCHER_VALID_DAYS : undefined,
      description: g.description,
      /* 实物商品发货方式（pickup 自提 | delivery 邮寄）与自提地址：客户端据此渲染选择与提示 */
      shippingMethods: g.fulfillment === 'physical' ? g.shippingMethods : [],
      pickupAddress: g.fulfillment === 'physical' && g.shippingMethods.includes('pickup') ? g.pickupAddress ?? undefined : undefined,
    }
  }

  private toOrderDto(o: RedemptionOrder) {
    const dto: Record<string, unknown> = {
      id: o.id,
      goodsId: o.goodsId,
      goodsName: o.goodsName,
      pointsCost: o.points,
      status: o.status === 'finished' ? 'completed' : o.status,
      fulfillment: o.fulfillment,
      createdAt: o.createdAt,
    }
    if (o.voucherCode != null) dto.voucherCode = o.voucherCode
    if (o.voucherExpiresAt != null) dto.voucherExpiresAt = o.voucherExpiresAt
    if (o.fulfillment === 'voucher' && o.status === 'pending_use' && o.voucherExpiresAt && o.voucherExpiresAt <= formatNow()) {
      dto.status = 'expired'
    }
    if (o.trackingNo != null) dto.trackingNo = o.trackingNo
    if (o.shippingMethod != null) dto.shippingMethod = o.shippingMethod
    if (o.pickupAddress != null) dto.pickupAddress = o.pickupAddress
    if (o.rating != null) dto.rating = o.rating
    if (o.reviewComment != null) dto.review = o.reviewComment
    if (o.recipientName != null) dto.recipientName = o.recipientName
    if (o.recipientPhone != null) dto.recipientPhone = o.recipientPhone
    if (o.address != null) dto.recipientAddress = o.address
    if (o.shippedAt != null) dto.shippedAt = o.shippedAt
    if (o.usedAt != null) dto.usedAt = o.usedAt
    if (o.finishedAt != null) dto.finishedAt = o.finishedAt
    if (o.cancelledAt != null) dto.cancelledAt = o.cancelledAt
    return dto
  }

  /** 时间字符串加天数 → YYYY-MM-DD HH:mm（voucher 有效期用） */
  private addDaysTime(timeStr: string, days: number): string {
    const d = new Date(timeStr.replace(' ', 'T'))
    d.setDate(d.getDate() + days)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
}

/* 券码：V + 8 位大写字母数字（去除易混淆字符） */
function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = 'V'
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}
