import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { MallGoods, PointsRecord, PointsRule, Prisma, RedemptionOrder } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_KEYS, CACHE_TTL } from '../../common/redis/cache-keys'
import { formatNow } from '../../common/utils/time'
import type { GoodsPayloadDto } from './dto/goods-payload.dto'
import type { QueryGoodsDto } from './dto/query-goods.dto'
import type { QueryRedemptionOrdersDto } from './dto/query-redemption-orders.dto'
import type { UpdatePointsRuleDto } from './dto/update-points-rule.dto'

/* M0 形状（apps/admin/src/types/index.ts）——返回与 M0 stub 逐字段一致（可空字段 null → undefined） */
export interface RedemptionOrderDto {
  id: string
  userId: string
  userName: string
  goodsId: string
  goodsName: string
  points: number
  status: string
  createdAt: string
  shippedAt?: string
  finishedAt?: string
  recipientName?: string
  recipientPhone?: string
  address?: string
  note?: string
  cancelReason?: string
}

export interface PointsRuleDto {
  code: string
  name: string
  scene: string
  points: number
  status: string
  description?: string
  updatedAt: string
}

/* 取消订单无取消原因入参（M0 stub 仅传 id），服务端固定文案落 cancelReason */
const ORDER_CANCEL_REASON = '管理员取消订单，积分已原路退回'

/* 积分商城（wiki-backend.md §7.10/§8.1/§8.3）：
 * 商品列表/创建/编辑/上下架（上架/下架写审计）、兑换订单发货/完成/取消（取消走事务退积分+回库存）、
 * 积分规则（8 条固定项仅编辑积分值与启停）、积分发放记录（source=rule） */
@Injectable()
export class MallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  /* ---------- 商品管理 ---------- */

  async listGoods(query: QueryGoodsDto): Promise<{ list: MallGoods[]; total: number }> {
    const where: Prisma.MallGoodsWhereInput = {}
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.category) where.category = query.category
    if (query.status) where.status = query.status

    const [rows, total] = await Promise.all([
      this.prisma.mallGoods.findMany({ where }),
      this.prisma.mallGoods.count({ where }),
    ])

    const field = query.sortBy ?? 'id'
    const dir = query.sortOrder === 'ascend' ? 1 : -1
    const sorted = [...rows].sort((a, b) => {
      const av = field === 'id' ? Number(a.id.replace('G', '')) : field === 'points' ? a.points : a.createdAt
      const bv = field === 'id' ? Number(b.id.replace('G', '')) : field === 'points' ? b.points : b.createdAt
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })

    const start = (query.page - 1) * query.pageSize
    return { list: sorted.slice(start, start + query.pageSize), total }
  }

  async createGoods(dto: GoodsPayloadDto): Promise<MallGoods> {
    return this.prisma.mallGoods.create({
      data: {
        id: await this.ids.next('G'),
        name: dto.name,
        category: dto.category,
        points: dto.points,
        stock: dto.stock,
        status: 'on',
        description: dto.description,
        redeemedCount: 0,
        createdAt: formatNow(),
      },
    })
  }

  async updateGoods(id: string, dto: GoodsPayloadDto): Promise<{ code: number }> {
    const goods = await this.prisma.mallGoods.findUnique({ where: { id } })
    if (!goods) throw new NotFoundException('商品不存在')

    await this.prisma.mallGoods.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        points: dto.points,
        stock: dto.stock,
        description: dto.description,
      },
    })
    return { code: 0 }
  }

  async toggleGoodsStatus(id: string, operator: string): Promise<{ code: number }> {
    const goods = await this.prisma.mallGoods.findUnique({ where: { id } })
    if (!goods) throw new NotFoundException('商品不存在')

    const nextStatus = goods.status === 'on' ? 'off' : 'on'
    await this.prisma.mallGoods.update({ where: { id }, data: { status: nextStatus } })

    await this.audit.record({
      module: '积分商城',
      action: nextStatus === 'on' ? '商品上架' : '商品下架',
      target: `${goods.id} · ${goods.name}`,
      before: { status: goods.status },
      after: { status: nextStatus },
      operator,
    })
    return { code: 0 }
  }

  /* ---------- 兑换订单 ---------- */

  async listRedemptionOrders(
    query: QueryRedemptionOrdersDto,
  ): Promise<{ list: RedemptionOrderDto[]; total: number }> {
    const where: Prisma.RedemptionOrderWhereInput = {}
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { userName: { contains: kw, mode: 'insensitive' } },
        { goodsName: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.status) where.status = query.status

    const [rows, total] = await Promise.all([
      this.prisma.redemptionOrder.findMany({ where }),
      this.prisma.redemptionOrder.count({ where }),
    ])

    const field = query.sortBy ?? 'id'
    const dir = query.sortOrder === 'ascend' ? 1 : -1
    const sorted = [...rows].sort((a, b) => {
      const av = field === 'id' ? Number(a.id.replace('RO', '')) : a.createdAt
      const bv = field === 'id' ? Number(b.id.replace('RO', '')) : b.createdAt
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })

    const start = (query.page - 1) * query.pageSize
    return { list: sorted.slice(start, start + query.pageSize).map(toOrderDto), total }
  }

  async shipOrder(id: string, operator: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('兑换订单不存在')
    if (order.status !== 'pending_shipment') throw new ConflictException('仅待发货订单可发货')

    await this.prisma.redemptionOrder.update({
      where: { id },
      data: { status: 'shipped', shippedAt: formatNow() },
    })

    await this.audit.record({
      module: '积分商城',
      action: '订单发货',
      target: `${order.id} · ${order.goodsName}`,
      before: { status: order.status },
      after: { status: 'shipped' },
      operator,
    })
    return { code: 0 }
  }

  async finishOrder(id: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('兑换订单不存在')
    if (order.status !== 'shipped') throw new ConflictException('仅已发货订单可标记完成')

    await this.prisma.redemptionOrder.update({
      where: { id },
      data: { status: 'finished', finishedAt: formatNow() },
    })
    return { code: 0 }
  }

  async cancelOrder(id: string): Promise<{ code: number }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.redemptionOrder.findUnique({ where: { id } })
      if (!order) throw new NotFoundException('兑换订单不存在')
      if (order.status !== 'pending_shipment') throw new ConflictException('仅待发货订单可取消')

      /* 退回积分：直接写 source=redemption 流水（wiki §7.10 冻结口径）。
       * 注：M0 mock 复用手动调整（source=manual/operator=管理员），语义上 redemption 更正确，按 wiki 实现 */
      const user = await tx.user.findUnique({ where: { uid: order.userId } })
      if (!user) throw new NotFoundException('用户不存在')
      const newBalance = user.points + order.points
      await tx.user.update({ where: { uid: order.userId }, data: { points: newBalance } })
      await tx.pointsRecord.create({
        data: {
          id: await this.ids.next('PT'),
          userId: order.userId,
          delta: order.points,
          balance: newBalance,
          reason: `订单取消退回积分（${order.id}）`,
          at: formatNow(),
          operator: '系统',
          source: 'redemption',
        },
      })

      /* 回补库存（stock+1、redeemedCount 不小于 0 递减） */
      const goods = await tx.mallGoods.findUnique({ where: { id: order.goodsId } })
      if (goods) {
        await tx.mallGoods.update({
          where: { id: order.goodsId },
          data: { stock: goods.stock + 1, redeemedCount: Math.max(0, goods.redeemedCount - 1) },
        })
      }

      await tx.redemptionOrder.update({
        where: { id },
        data: { status: 'cancelled', cancelReason: ORDER_CANCEL_REASON },
      })

      return { code: 0 }
    })
  }

  /* ---------- 积分规则 ---------- */

  async listPointsRules(): Promise<PointsRuleDto[]> {
    /* 与积分引擎共用 rules:points（存原始行，按 code 升序，保证两边缓存内容一致） */
    const rules = await this.redis.remember(CACHE_KEYS.pointsRules, CACHE_TTL.stable, () =>
      this.prisma.pointsRule.findMany({ orderBy: { code: 'asc' } }),
    )
    return rules.map(toPointsRuleDto)
  }

  async updatePointsRule(code: string, dto: UpdatePointsRuleDto): Promise<{ code: number }> {
    const rule = await this.prisma.pointsRule.findUnique({ where: { code } })
    if (!rule) throw new NotFoundException('积分规则不存在')
    if (!Number.isInteger(dto.points) || dto.points <= 0) {
      throw new BadRequestException('积分值必须为正整数')
    }

    await this.prisma.pointsRule.update({
      where: { code },
      data: { points: dto.points, updatedAt: formatNow() },
    })

    await this.redis.delCache(CACHE_KEYS.pointsRules)
    return { code: 0 }
  }

  async togglePointsRuleStatus(code: string): Promise<{ code: number }> {
    const rule = await this.prisma.pointsRule.findUnique({ where: { code } })
    if (!rule) throw new NotFoundException('积分规则不存在')

    await this.prisma.pointsRule.update({
      where: { code },
      data: { status: rule.status === 'enabled' ? 'disabled' : 'enabled', updatedAt: formatNow() },
    })

    await this.redis.delCache(CACHE_KEYS.pointsRules)
    return { code: 0 }
  }

  /* ---------- 积分发放记录 ---------- */

  async listPointsIssuance(): Promise<PointsRecord[]> {
    return this.prisma.pointsRecord.findMany({
      where: { source: 'rule' },
      orderBy: { at: 'desc' },
    })
  }
}

/* Prisma 行 → M0 形状（可空字段 null → undefined） */
function toOrderDto(order: RedemptionOrder): RedemptionOrderDto {
  const dto: RedemptionOrderDto = {
    id: order.id,
    userId: order.userId,
    userName: order.userName,
    goodsId: order.goodsId,
    goodsName: order.goodsName,
    points: order.points,
    status: order.status,
    createdAt: order.createdAt,
  }
  if (order.shippedAt != null) dto.shippedAt = order.shippedAt
  if (order.finishedAt != null) dto.finishedAt = order.finishedAt
  if (order.recipientName != null) dto.recipientName = order.recipientName
  if (order.recipientPhone != null) dto.recipientPhone = order.recipientPhone
  if (order.address != null) dto.address = order.address
  if (order.note != null) dto.note = order.note
  if (order.cancelReason != null) dto.cancelReason = order.cancelReason
  return dto
}

function toPointsRuleDto(rule: PointsRule): PointsRuleDto {
  const dto: PointsRuleDto = {
    code: rule.code,
    name: rule.name,
    scene: rule.scene,
    points: rule.points,
    status: rule.status,
    updatedAt: rule.updatedAt,
  }
  if (rule.description != null) dto.description = rule.description
  return dto
}
