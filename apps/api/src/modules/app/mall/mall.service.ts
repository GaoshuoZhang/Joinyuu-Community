import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { DictEntry, MallGoods, Prisma, RedemptionOrder } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { RedisService } from '../../../common/redis/redis.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import { discountLabel, discountedPoints, resolveUserPointsDiscount } from '../../../common/points/points-discount'
import { CreateOrderDto } from './dto/create-order.dto'
import { ReviewOrderDto } from './dto/review-order.dto'

/* 重复点击去重标记 TTL（秒）：同一用户对同一商品短时间内多次提交判定为重复 */
const ORDER_DEDUPE_TTL = 3

/* 券码默认有效期（天）：商品未配置 validDays 时兜底 */
const DEFAULT_VOUCHER_VALID_DAYS = 30

/* 积分商城（统一券码兑换，/api/app/mall + /api/app/me/orders）：
 * 商品列表/详情（mallOpen 开关 + on/restock 均可见，库存为 0 时前端展示售罄）、
 * 兑换下单（单事务：校验库存→扣积分+流水→扣库存→建单并签发券码，按商品 validDays 计算有效期）、
 * 退款（仅待使用券，核销前可退：退积分+回补库存）、订单评价。
 * 可见/可下单范围门槛：商品自身范围 + 所属「商品类别」（字典 goods_category）范围都需通过（空数组 = 不限）；
 * 类别被禁用（status !== enabled）或字典项已删除时，其下商品对客户端一律不可见（商品未配类别视为不限）。
 * 不可见一律 404（不暴露存在性），可下单范围外下单 403；游客按无身份处理（仅不限范围商品可见）。
 * 券码由后台工作人员现场核销（pending_use → finished），用户不可自主核销；
 * 过期未使用的券由定时任务自动退款（见 SchedulerService）。 */
@Injectable()
export class AppMallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly redis: RedisService,
    private readonly notify: NotificationService,
  ) {}

  /* ---------- 商品 ---------- */

  async listGoods(page: number, pageSize: number, category?: string, keyword?: string, uid?: string) {
    await this.assertMallOpen()
    const identities = await this.loadIdentities(uid)
    /* 类别门槛：类别级可见范围不通过的一律剔除（类别字典很小，直接内存判定） */
    const blocked = await this.blockedCategories(identities, 'visibility')
    const conds: Prisma.MallGoodsWhereInput[] = [this.goodsVisibilityCond(identities)]
    if (blocked.length) conds.push({ category: { notIn: blocked } })
    if (category) conds.push({ category })
    const kw = keyword?.trim()
    if (kw) conds.push({ name: { contains: kw, mode: 'insensitive' } })
    const where: Prisma.MallGoodsWhereInput = {
      status: { in: ['on', 'restock'] },
      deletedAt: null,
      AND: conds,
    }

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

  async goodsDetail(id: string, uid?: string) {
    await this.assertMallOpen()
    const goods = await this.prisma.mallGoods.findFirst({
      where: { id, deletedAt: null, status: { in: ['on', 'restock'] } },
    })
    if (!goods) throw new NotFoundException('商品不存在')
    const identities = await this.loadIdentities(uid)
    const category = await this.categoryEntry(goods.category)
    /* 可见范围外一律 404，不暴露存在性 */
    if (!this.canSee(goods, category, identities)) throw new NotFoundException('商品不存在')
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
    /* 可见 / 可下单范围门槛（类别 + 商品自身）：可见范围外按不存在处理，可下单范围外明确 403 */
    const identities = await this.loadIdentities(uid)
    const category = await this.categoryEntry(goods.category)
    if (!this.canSee(goods, category, identities)) throw new NotFoundException('商品不存在')
    if (!this.canOrder(goods, category, identities)) throw new ForbiddenException('当前身份暂不可兑换该商品')

    const user = await this.prisma.user.findUnique({ where: { uid } })
    if (!user) throw new BadRequestException('用户不存在')
    /* 等级折扣（个人消费取本人社区个体等级折扣）：实扣 = round(商品积分 × 折扣 ÷ 10)（口径见 common/points/points-discount） */
    const discount = await resolveUserPointsDiscount(this.prisma, uid)
    const charged = discountedPoints(goods.points, discount)
    if (user.points < charged) throw new BadRequestException('积分不足')

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
          where: { uid, points: { gte: charged } },
          data: { points: { decrement: charged } },
        })
        if (deducted.count !== 1) throw new BadRequestException('积分不足')
        const afterDeduct = await tx.user.findUnique({ where: { uid }, select: { points: true } })
        remaining = afterDeduct?.points ?? 0
        await tx.pointsRecord.create({
          data: {
            id: await this.ids.next('PT', tx),
            userId: uid,
            delta: -charged,
            balance: remaining,
            reason: `兑换 ${goods.name}（${goods.id}）${discountLabel(discount)}`,
            at: formatNow(),
            operator: '系统',
            source: 'redemption',
          },
        })

        orderId = await this.ids.next('RO', tx)
        const voucherCode = await this.uniqueVoucherCode(tx)
        await tx.redemptionOrder.create({
          /* 订单 points 存实扣额（退款/展示同一口径） */
          data: this.buildOrderData(orderId, uid, user.nickname, goods, dto, charged, voucherCode),
        })
      })
    } catch (error) {
      await this.redis.delCache(dedupeKey)
      throw error
    }

    await this.notify.pushNotice(uid, {
      type: 'mall',
      title: '兑换成功',
      content: `您已成功兑换「${goods.name}」，消耗 ${charged} 积分，请凭券码到现场核销使用。`,
    })
    return { id: orderId, remainingPoints: remaining }
  }

  /* ---------- 我的订单 ---------- */

  async myOrders(uid: string, page = 1, pageSize = 20, status?: string) {
    const where: Prisma.RedemptionOrderWhereInput = { userId: uid, deletedAt: null }
    if (status) where.status = status
    const [rows, total] = await Promise.all([
      this.prisma.redemptionOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.redemptionOrder.count({ where }),
    ])
    return { list: rows.map((o) => this.toOrderDto(o)), total }
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

  /* ---------- 订单履约（用户侧仅退款；核销由后台工作人员执行） ---------- */

  /** 退款：仅待使用（pending_use）券可退，核销前退积分 + 回补库存。 */
  async cancelOrder(uid: string, id: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.userId !== uid) throw new ForbiddenException('无权操作该订单')
    const now = formatNow()
    await this.prisma.$transaction(async (tx) => {
      /* 先以状态条件抢占取消权；并发请求只有一个能进入退款逻辑。 */
      const claimed = await tx.redemptionOrder.updateMany({
        where: { id, userId: uid, status: 'pending_use' },
        data: { status: 'cancelled', cancelledAt: now, cancelReason: '用户申请退款，积分已原路退回' },
      })
      if (claimed.count !== 1) throw new ConflictException('仅待使用的订单可退款')

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
          reason: `订单退款退回积分（${order.id}）`,
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
      title: '订单已退款',
      content: `您已退款「${order.goodsName}」的兑换订单，${order.points} 积分已原路退回。`,
    })
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

  /* ---------- 可见/可下单范围（门槛：商品类别范围 + 商品自身范围都需通过） ---------- */

  /** 取用户身份集（type + level），供范围过滤（与活动/需求列表同口径）；游客/未登录 = 无身份 */
  private async loadIdentities(uid?: string): Promise<Array<{ type: string; level: number | null }>> {
    if (!uid) return []
    return this.prisma.userIdentity.findMany({ where: { userId: uid }, select: { type: true, level: true } })
  }

  /** 范围过滤：按「单个身份」联合判定（类型命中且等级命中），多身份取并集；两组都为空 = 不限 */
  private scopeMatches(
    identityTypes: string[],
    levels: string[],
    identities: Array<{ type: string; level: number | null }>,
  ): boolean {
    if (identityTypes.length === 0 && levels.length === 0) return true
    return identities.some(
      (i) =>
        (identityTypes.length === 0 || identityTypes.includes(i.type)) &&
        (levels.length === 0 || (i.level != null && levels.includes(String(i.level)))),
    )
  }

  /** 类别字典项（type=goods_category，含类别级范围） */
  private categoryEntry(code: string): Promise<DictEntry | null> {
    return this.prisma.dictEntry.findUnique({ where: { type_code: { type: 'goods_category', code } } })
  }

  /** 类别门槛不通过的类别 code 列表（禁用/已停用类别一律 blocked；可见用 category.visibility*，可下单用 category.order*） */
  private async blockedCategories(
    identities: Array<{ type: string; level: number | null }>,
    field: 'visibility' | 'order',
  ): Promise<string[]> {
    const entries = await this.prisma.dictEntry.findMany({ where: { type: 'goods_category' } })
    return entries
      .filter((entry) => entry.status !== 'enabled' || !this.scopeMatches(
        field === 'visibility' ? entry.visibilityIdentities : entry.orderIdentities,
        field === 'visibility' ? entry.visibilityLevels : entry.orderLevels,
        identities,
      ))
      .map((entry) => entry.code)
  }

  /** 可见判定：商品自身可见范围通过，且（未配类别 = 不限；配了类别则需字典项存在、status=enabled 且类别可见范围通过） */
  private canSee(goods: MallGoods, category: DictEntry | null, identities: Array<{ type: string; level: number | null }>): boolean {
    if (!this.scopeMatches(goods.visibilityIdentities, goods.visibilityLevels, identities)) return false
    const code = (goods.category ?? '').trim()
    if (!code) return true
    return category != null && category.status === 'enabled'
      && this.scopeMatches(category.visibilityIdentities, category.visibilityLevels, identities)
  }

  /** 可下单判定：先需可见，且类别与商品自身的可下单范围都通过 */
  private canOrder(goods: MallGoods, category: DictEntry | null, identities: Array<{ type: string; level: number | null }>): boolean {
    return this.canSee(goods, category, identities)
      && this.scopeMatches(goods.orderIdentities, goods.orderLevels, identities)
      && this.scopeMatches(category?.orderIdentities ?? [], category?.orderLevels ?? [], identities)
  }

  /** 商品自身可见范围 → SQL 条件（无身份时按最严格：仅不限范围商品可见） */
  private goodsVisibilityCond(identities: Array<{ type: string; level: number | null }>): Prisma.MallGoodsWhereInput {
    if (identities.length === 0) {
      return { visibilityIdentities: { isEmpty: true }, visibilityLevels: { isEmpty: true } }
    }
    const branches: Prisma.MallGoodsWhereInput[] = identities.map((i) => {
      const typeCond: Prisma.MallGoodsWhereInput = {
        OR: [{ visibilityIdentities: { isEmpty: true } }, { visibilityIdentities: { has: i.type } }],
      }
      const levelCond: Prisma.MallGoodsWhereInput =
        i.level != null
          ? { OR: [{ visibilityLevels: { isEmpty: true } }, { visibilityLevels: { has: String(i.level) } }] }
          : { visibilityLevels: { isEmpty: true } }
      return { AND: [typeCond, levelCond] }
    })
    return { OR: branches }
  }

  private async assertMallOpen(): Promise<void> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (cfg && cfg.mallOpen === false) throw new BadRequestException('积分商城暂未开放')
  }

  /** 券码防碰撞：随机生成后校验库内是否已存在（含归档订单），重复则重试至多 5 次；
   * 生成空间 32^8 ≈ 1.1e12，正常一次命中。voucherCode 无唯一索引，此处为保证核销定位唯一性的应用层防护 */
  private async uniqueVoucherCode(tx: Prisma.TransactionClient): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const code = generateVoucherCode()
      const exists = await tx.redemptionOrder.findFirst({ where: { voucherCode: code }, select: { id: true } })
      if (!exists) return code
    }
    throw new ConflictException('券码生成冲突，请稍后重试')
  }

  private buildOrderData(
    id: string,
    userId: string,
    userName: string,
    goods: { id: string; name: string; points: number; validDays: number | null },
    dto: CreateOrderDto,
    /** 实扣积分（等级折扣后；原价时与 goods.points 相同） */
    points: number,
    /** 已做碰撞校验的券码 */
    voucherCode: string,
  ): Prisma.RedemptionOrderCreateInput {
    const now = formatNow()
    const validDays = goods.validDays && goods.validDays > 0 ? goods.validDays : DEFAULT_VOUCHER_VALID_DAYS
    return {
      id,
      user: { connect: { uid: userId } },
      userName,
      goodsId: goods.id,
      goodsName: goods.name,
      points,
      status: 'pending_use',
      createdAt: now,
      note: dto.remark?.trim() || null,
      voucherCode,
      voucherExpiresAt: this.addDaysTime(now, validDays),
    }
  }

  private toGoodsDto(g: {
    id: string
    name: string
    coverUrl: string | null
    category: string
    points: number
    stock: number
    validDays: number | null
    description: string
  }) {
    return {
      id: g.id,
      name: g.name,
      coverUrl: g.coverUrl ?? undefined,
      category: g.category,
      points: g.points,
      pointsCost: g.points,
      stock: g.stock,
      validDays: g.validDays ?? DEFAULT_VOUCHER_VALID_DAYS,
      description: g.description,
    }
  }

  private toOrderDto(o: RedemptionOrder) {
    const dto: Record<string, unknown> = {
      id: o.id,
      goodsId: o.goodsId,
      goodsName: o.goodsName,
      pointsCost: o.points,
      status: o.status === 'finished' ? 'completed' : o.status,
      createdAt: o.createdAt,
      voucherCode: o.voucherCode,
      voucherExpiresAt: o.voucherExpiresAt,
    }
    /* 待使用但已过有效期：客户端展示「已过期」（自动退款由定时任务落库为 cancelled） */
    if (o.status === 'pending_use' && o.voucherExpiresAt && o.voucherExpiresAt <= formatNow()) {
      dto.status = 'expired'
    }
    if (o.rating != null) dto.rating = o.rating
    if (o.reviewComment != null) dto.review = o.reviewComment
    if (o.usedAt != null) dto.usedAt = o.usedAt
    if (o.finishedAt != null) dto.finishedAt = o.finishedAt
    if (o.cancelledAt != null) dto.cancelledAt = o.cancelledAt
    return dto
  }

  /** 时间字符串加天数 → YYYY-MM-DD HH:mm（券码有效期用） */
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
