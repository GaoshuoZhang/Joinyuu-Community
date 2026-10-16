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
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import type { GoodsPayloadDto } from './dto/goods-payload.dto'
import type { QueryGoodsDto } from './dto/query-goods.dto'
import type { QueryRedemptionOrdersDto } from './dto/query-redemption-orders.dto'
import type { UpdatePointsRuleDto } from './dto/update-points-rule.dto'
import { NotificationService } from '../../common/notify/notification.service'

/* 返回形状与 apps/admin/src/types/index.ts 逐字段一致（可空字段 null → undefined） */
export interface RedemptionOrderDto {
  id: string
  userId: string
  userName: string
  goodsId: string
  goodsName: string
  points: number
  status: string
  createdAt: string
  finishedAt?: string
  note?: string
  cancelReason?: string
  voucherCode: string
  voucherExpiresAt: string
  usedAt?: string
}

/* 商品出参：category 存字典编码，另附 categoryLabel 供展示（前端渲染 x.categoryLabel ?? x.category） */
export interface MallGoodsDto extends MallGoods {
  categoryLabel: string
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

/* 取消（退款）订单无取消原因入参（仅传 id），服务端固定文案落 cancelReason */
const ORDER_CANCEL_REASON = '管理员退款，积分已原路退回'

/* 积分商城（统一券码兑换）：
 * 商品列表/新增/编辑/上下架（上架/下架写审计；有效期 validDays 控制券码到期）、
 * 兑换订单核销（pending_use → finished，写审计+站内信）/退款（退积分回库存）/归档、
 * 积分规则（9 条固定项仅编辑积分值与启停）、积分发放记录（source=rule） */
@Injectable()
export class MallService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly notify: NotificationService,
  ) {}

  /* ---------- 商品管理 ---------- */

  async listGoods(query: QueryGoodsDto): Promise<{ list: MallGoodsDto[]; total: number }> {
    const where: Prisma.MallGoodsWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.category) where.category = this.resolveCategory(query.category)
    if (query.status) where.status = { in: query.status }

    /* 排序与计数、分页下发数据库 */
    const field = query.sortBy ?? 'id'
    const desc = query.sortOrder !== 'ascend'
    const offset = (query.page - 1) * query.pageSize

    if (field === 'id') {
      /* Prisma orderBy 只能按字符串比较编号（G9/G10 会错序），故保留数值序：
       * 仅取编号列在库内过滤后内存定位当页编号，再按编号批量取当页行，避免整行全表载入 */
      const dir = desc ? -1 : 1
      const [idRows, total] = await Promise.all([
        this.prisma.mallGoods.findMany({ where, select: { id: true } }),
        this.prisma.mallGoods.count({ where }),
      ])
      const pageIds = idRows
        .map((row) => row.id)
        .sort((a, b) => {
          const av = Number(a.replace('G', ''))
          const bv = Number(b.replace('G', ''))
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        })
        .slice(offset, offset + query.pageSize)
      const list = pageIds.length
        ? await this.prisma.mallGoods.findMany({ where: { id: { in: pageIds } } })
        : []
      const pos = new Map(pageIds.map((id, index) => [id, index]))
      list.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
      return { list: await this.withCategoryLabels(list), total }
    }

    const [list, total] = await Promise.all([
      this.prisma.mallGoods.findMany({
        where,
        orderBy: field === 'points' ? { points: desc ? 'desc' : 'asc' } : { createdAt: desc ? 'desc' : 'asc' },
        skip: offset,
        take: query.pageSize,
      }),
      this.prisma.mallGoods.count({ where }),
    ])
    return { list: await this.withCategoryLabels(list), total }
  }

  async createGoods(dto: GoodsPayloadDto, operator: string): Promise<MallGoods> {
    const goods = await this.prisma.mallGoods.create({
      data: {
        id: await this.ids.next('G'),
        name: dto.name,
        coverUrl: dto.coverUrl?.trim() || null,
        category: this.resolveCategory(dto.category),
        points: dto.points,
        stock: dto.stock,
        status: dto.stock === 0 ? 'restock' : 'off',
        description: sanitizeHtml(dto.description),
        redeemedCount: 0,
        validDays: dto.validDays && dto.validDays > 0 ? dto.validDays : null,
        visibilityIdentities: dto.visibilityIdentities ?? [],
        visibilityLevels: dto.visibilityLevels ?? [],
        orderIdentities: dto.orderIdentities ?? [],
        orderLevels: dto.orderLevels ?? [],
        createdAt: formatNow(),
      },
    })

    await this.audit.record({
      module: '积分商城',
      action: '新增商品',
      target: `${goods.id} · ${goods.name}`,
      after: { status: goods.status },
      operator,
    })
    return goods
  }

  async updateGoods(id: string, dto: GoodsPayloadDto, operator: string): Promise<{ code: number }> {
    const goods = await this.prisma.mallGoods.findFirst({ where: { id, deletedAt: null } })
    if (!goods) throw new NotFoundException('商品不存在')

    /* 库存变更感知：客户端回传弹窗打开时的库存基线 baseStock；
     * 未变更（dto.stock === baseStock）时不写库存，避免用表单旧值覆盖期间的下单扣减/退款回补 */
    const stockUnchanged = dto.baseStock !== undefined && dto.stock === dto.baseStock

    /* 库存归零 → 待补货；补货后由待补货回落为下架，其余状态不变（未变更时以库内当前库存为准） */
    const stockForStatus = stockUnchanged ? goods.stock : dto.stock
    const status = stockForStatus === 0 ? 'restock' : goods.status === 'restock' ? 'off' : goods.status

    await this.prisma.mallGoods.update({
      where: { id },
      data: {
        name: dto.name,
        coverUrl: dto.coverUrl?.trim() || null,
        category: this.resolveCategory(dto.category),
        points: dto.points,
        ...(stockUnchanged ? {} : { stock: dto.stock }),
        status,
        description: sanitizeHtml(dto.description),
        validDays: dto.validDays && dto.validDays > 0 ? dto.validDays : null,
        visibilityIdentities: dto.visibilityIdentities ?? [],
        visibilityLevels: dto.visibilityLevels ?? [],
        orderIdentities: dto.orderIdentities ?? [],
        orderLevels: dto.orderLevels ?? [],
      },
    })

    await this.audit.record({
      module: '积分商城',
      action: '编辑商品',
      target: `${goods.id} · ${goods.name}`,
      before: { status: goods.status },
      after: { status },
      operator,
    })
    return { code: 0 }
  }

  async toggleGoodsStatus(id: string, operator: string): Promise<{ code: number }> {
    const goods = await this.prisma.mallGoods.findFirst({ where: { id, deletedAt: null } })
    if (!goods) throw new NotFoundException('商品不存在')

    /* 下架即进入可归档计时（archivableAt）；重新上架清除计时 */
    const nextStatus = goods.status === 'on' ? 'off' : 'on'
    if (nextStatus === 'on' && goods.stock <= 0) throw new ConflictException('库存为 0，无法上架')
    const archivableAt = nextStatus === 'off' ? formatNow() : null
    await this.prisma.mallGoods.update({ where: { id }, data: { status: nextStatus, archivableAt } })

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

  async archiveGoods(id: string, operator: string): Promise<{ code: number }> {
    const goods = await this.prisma.mallGoods.findFirst({ where: { id, deletedAt: null } })
    if (!goods) throw new NotFoundException('商品不存在')
    if (goods.status !== 'off') throw new ConflictException('仅已下架的商品可归档')

    await this.prisma.mallGoods.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '积分商城',
      action: '归档商品',
      target: `${goods.id} · ${goods.name}`,
      before: { status: goods.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  /** 兼容 R1 旧管理端 category 值。 */
  private resolveCategory(category: string): string {
    const aliases: Record<string, string> = {
      physical: 'GC001',
      '实物商品': 'GC001',
      voucher: 'GC003',
      '权益券': 'GC003',
    }
    return aliases[category] ?? category
  }

  /** 商品类型字段保存字典编码；响应同时附带标签，编码已删除或历史直接保存标签时安全回退原值。 */
  private async withCategoryLabels(goods: MallGoods[]): Promise<MallGoodsDto[]> {
    const codes = [...new Set(goods.map((item) => item.category).filter(Boolean))]
    const entries = codes.length
      ? await this.prisma.dictEntry.findMany({
          where: { type: 'goods_category', code: { in: codes } },
          select: { code: true, label: true },
        })
      : []
    const labels = new Map(entries.map((entry) => [entry.code, entry.label]))
    return goods.map((item) => ({ ...item, categoryLabel: labels.get(item.category) ?? item.category }))
  }

  /* ---------- 兑换订单 ---------- */

  async listRedemptionOrders(
    query: QueryRedemptionOrdersDto,
  ): Promise<{ list: RedemptionOrderDto[]; total: number }> {
    const where: Prisma.RedemptionOrderWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { userName: { contains: kw, mode: 'insensitive' } },
        { goodsName: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
        /* 券码现场兑换：支持扫/输券码直接锁定订单 */
        { voucherCode: { equals: kw, mode: 'insensitive' } },
      ]
    }
    if (query.status) where.status = { in: query.status }

    /* 排序与计数、分页下发数据库 */
    const field = query.sortBy ?? 'id'
    const desc = query.sortOrder !== 'ascend'
    const offset = (query.page - 1) * query.pageSize

    if (field === 'id') {
      /* Prisma orderBy 只能按字符串比较编号（RO9/RO10 会错序），故保留数值序：
       * 仅取编号列在库内过滤后内存定位当页编号，再按编号批量取当页行，避免整行全表载入 */
      const dir = desc ? -1 : 1
      const [idRows, total] = await Promise.all([
        this.prisma.redemptionOrder.findMany({ where, select: { id: true } }),
        this.prisma.redemptionOrder.count({ where }),
      ])
      const pageIds = idRows
        .map((row) => row.id)
        .sort((a, b) => {
          const av = Number(a.replace('RO', ''))
          const bv = Number(b.replace('RO', ''))
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        })
        .slice(offset, offset + query.pageSize)
      const rows = pageIds.length
        ? await this.prisma.redemptionOrder.findMany({ where: { id: { in: pageIds } } })
        : []
      const pos = new Map(pageIds.map((id, index) => [id, index]))
      rows.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
      return { list: rows.map(toOrderDto), total }
    }

    const [rows, total] = await Promise.all([
      this.prisma.redemptionOrder.findMany({
        where,
        orderBy: { createdAt: desc ? 'desc' : 'asc' },
        skip: offset,
        take: query.pageSize,
      }),
      this.prisma.redemptionOrder.count({ where }),
    ])
    return { list: rows.map(toOrderDto), total }
  }

  /** 券码核销（现场兑换由工作人员执行）：pending_use → finished，写审计并通知用户。 */
  async verifyOrder(id: string, operator: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findUnique({ where: { id } })
    if (!order) throw new NotFoundException('兑换订单不存在')
    const now = formatNow()
    if (order.status !== 'pending_use') throw new ConflictException('仅待使用的订单可核销')
    if (order.voucherExpiresAt && order.voucherExpiresAt <= now) {
      throw new ConflictException('券码已过期，无法核销（将由系统自动退款）')
    }

    /* 并发安全：以状态条件抢占，避免重复核销 */
    const claimed = await this.prisma.redemptionOrder.updateMany({
      where: { id, status: 'pending_use' },
      data: { status: 'finished', usedAt: now, finishedAt: now, archivableAt: now },
    })
    if (claimed.count !== 1) throw new ConflictException('仅待使用的订单可核销')

    await this.audit.record({
      module: '积分商城',
      action: '订单核销',
      target: `${order.id} · ${order.goodsName}`,
      detail: `券码 ${order.voucherCode} 现场核销`,
      before: { status: order.status },
      after: { status: 'finished' },
      operator,
    })
    await this.notify.pushNotice(order.userId, {
      type: 'mall',
      title: '兑换订单已核销',
      content: `您兑换的「${order.goodsName}」已核销完成，感谢您的使用。`,
      link: '/me/orders',
    })
    return { code: 0 }
  }

  async archiveOrder(id: string, operator: string): Promise<{ code: number }> {
    const order = await this.prisma.redemptionOrder.findFirst({ where: { id, deletedAt: null } })
    if (!order) throw new NotFoundException('订单不存在')
    if (order.status !== 'finished' && order.status !== 'cancelled') {
      throw new ConflictException('仅已完成或已取消的订单可归档')
    }

    await this.prisma.redemptionOrder.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '积分商城',
      action: '归档订单',
      target: `${order.id} · ${order.goodsName}`,
      before: { status: order.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  /** 退款（管理员代操作）：pending_use → cancelled，退积分 + 回补库存。 */
  async cancelOrder(id: string, operator: string): Promise<{ code: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.redemptionOrder.findUnique({ where: { id } })
      if (!order) throw new NotFoundException('兑换订单不存在')

      /* 并发安全：先以状态条件抢占取消权，只有抢占成功者才进入退款/补库存，
       * 避免并发取消造成重复退积分与重复回补库存 */
      const claimed = await tx.redemptionOrder.updateMany({
        where: { id, status: 'pending_use' },
        data: { status: 'cancelled', cancelledAt: formatNow(), cancelReason: ORDER_CANCEL_REASON },
      })
      if (claimed.count !== 1) throw new ConflictException('仅待使用的订单可退款')

      /* 退回积分：原子自增（wiki §7.10 冻结口径：写 source=redemption 流水） */
      const refunded = await tx.user.update({
        where: { uid: order.userId },
        data: { points: { increment: order.points } },
        select: { points: true },
      })
      const newBalance = refunded.points
      await tx.pointsRecord.create({
        data: {
          id: await this.ids.next('PT'),
          userId: order.userId,
          delta: order.points,
          balance: newBalance,
          reason: `订单退款退回积分（${order.id}）`,
          at: formatNow(),
          operator: '系统',
          source: 'redemption',
        },
      })

      /* 回补库存：原子自增（stock+1、redeemedCount-1）；待补货商品补货后回落为下架 */
      const goods = await tx.mallGoods.findUnique({ where: { id: order.goodsId }, select: { status: true } })
      if (goods) {
        const restoreStatus = goods.status === 'restock' ? { status: 'off' } : {}
        await tx.mallGoods.update({
          where: { id: order.goodsId },
          data: { stock: { increment: 1 }, redeemedCount: { decrement: 1 }, ...restoreStatus },
        })
      }

      return { code: 0, userId: order.userId, goodsName: order.goodsName, points: order.points }
    })
    await this.audit.record({
      module: '积分商城',
      action: '订单退款',
      target: `${id}`,
      detail: `退回 ${result.points} 积分并回补库存`,
      operator,
    })
    await this.notify.pushNotice(result.userId, {
      type: 'mall',
      title: '兑换订单已退款',
      content: `「${result.goodsName}」订单已退款，${result.points} 积分已退回。`,
      link: '/me/orders',
    })
    return { code: result.code }
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

/* Prisma 行 → 返回形状（可空字段 null → undefined） */
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
    voucherCode: order.voucherCode,
    voucherExpiresAt: order.voucherExpiresAt,
  }
  if (order.finishedAt != null) dto.finishedAt = order.finishedAt
  if (order.usedAt != null) dto.usedAt = order.usedAt
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
