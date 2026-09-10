import type {
  PageResult,
  MallGoods,
  RedemptionOrder,
  PointsRule,
  PointsRecord,
  GoodsCategory,
} from '@/types'
import { goods, redemptionOrders, pointsRules, pointsRecords } from '@/mock'
import { delay } from './utils'
import { adjustPoints } from './ledgers'
import { recordAudit } from './auditLogs'

/* 数据一致性约定：
 * - 兑换订单取消 → 通过 adjustPoints 退回积分（写 PT 流水），并回补商品库存
 * - 积分流水末笔 balance 与 users 中该用户 points 一致（见 mock/ledgers.ts 与 mall.ts 头注释） */

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------- 商品管理 ---------- */

export interface GoodsQuery {
  page: number
  pageSize: number
  keyword?: string
  category?: GoodsCategory | ''
  status?: string
  /** 排序字段：id | points | createdAt */
  sortBy?: 'id' | 'points' | 'createdAt'
  /** 排序方向：descend 默认 | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* TODO: 替换为 GET /api/admin/mall/goods?page&pageSize&keyword&category&status */
export async function fetchGoods(query: GoodsQuery): Promise<PageResult<MallGoods>> {
  await delay(400)
  let list = [...goods]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((g) => g.name.toLowerCase().includes(kw) || g.id.toLowerCase().includes(kw))
  }
  if (query.category) list = list.filter((g) => g.category === query.category)
  if (query.status) list = list.filter((g) => g.status === query.status)
  const field = query.sortBy ?? 'id'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    const av = field === 'id' ? Number(a.id.replace('G', '')) : field === 'points' ? a.points : a.createdAt
    const bv = field === 'id' ? Number(b.id.replace('G', '')) : field === 'points' ? b.points : b.createdAt
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

export interface GoodsPayload {
  name: string
  category: GoodsCategory
  points: number
  stock: number
  description: string
}

/* TODO: 替换为 POST /api/admin/mall/goods — 创建商品（创建即上架 status=on，累计兑换次数从 0 起） */
export async function createGoods(payload: GoodsPayload): Promise<MallGoods> {
  await delay(500)
  const maxNum = goods.reduce((m, g) => Math.max(m, Number(g.id.replace('G', ''))), 0)
  const item: MallGoods = {
    id: `G${maxNum + 1}`,
    name: payload.name,
    category: payload.category,
    points: payload.points,
    stock: payload.stock,
    status: 'on',
    description: payload.description,
    redeemedCount: 0,
    createdAt: formatNow(),
  }
  goods.push(item)
  return item
}

/* TODO: 替换为 PUT /api/admin/mall/goods/:id — 编辑商品（不影响已有兑换订单） */
export async function updateGoods(id: string, payload: GoodsPayload): Promise<{ code: number }> {
  await delay(400)
  const item = goods.find((g) => g.id === id)
  if (!item) throw new Error('商品不存在')
  item.name = payload.name
  item.category = payload.category
  item.points = payload.points
  item.stock = payload.stock
  item.description = payload.description
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/mall/goods/:id/toggle-status — 上架/下架 */
export async function toggleGoodsStatus(id: string): Promise<{ code: number }> {
  await delay(350)
  const item = goods.find((g) => g.id === id)
  if (!item) throw new Error('商品不存在')
  item.status = item.status === 'on' ? 'off' : 'on'
  recordAudit('积分商城', item.status === 'on' ? '商品上架' : '商品下架', `${item.id} · ${item.name}`)
  return { code: 0 }
}

/* ---------- 兑换订单 ---------- */

export interface RedemptionOrderQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  /** 排序字段：id | createdAt */
  sortBy?: 'id' | 'createdAt'
  /** 排序方向：descend 默认 | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* TODO: 替换为 GET /api/admin/mall/redemption-orders?page&pageSize&keyword&status */
export async function fetchRedemptionOrders(
  query: RedemptionOrderQuery,
): Promise<PageResult<RedemptionOrder>> {
  await delay(400)
  let list = [...redemptionOrders]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter(
      (o) =>
        o.userName.toLowerCase().includes(kw) ||
        o.goodsName.toLowerCase().includes(kw) ||
        o.id.toLowerCase().includes(kw),
    )
  }
  if (query.status) list = list.filter((o) => o.status === query.status)
  const field = query.sortBy ?? 'id'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    const av = field === 'id' ? Number(a.id.replace('RO', '')) : a.createdAt
    const bv = field === 'id' ? Number(b.id.replace('RO', '')) : b.createdAt
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 POST /api/admin/mall/redemption-orders/:id/ship — 待发货 → 已发货 */
export async function shipRedemptionOrder(id: string): Promise<{ code: number }> {
  await delay(350)
  const order = redemptionOrders.find((o) => o.id === id)
  if (!order) throw new Error('兑换订单不存在')
  if (order.status !== 'pending_shipment') throw new Error('仅待发货订单可发货')
  order.status = 'shipped'
  order.shippedAt = formatNow()
  recordAudit('积分商城', '订单发货', `${order.id} · ${order.goodsName}`)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/mall/redemption-orders/:id/finish — 已发货 → 已完成 */
export async function finishRedemptionOrder(id: string): Promise<{ code: number }> {
  await delay(350)
  const order = redemptionOrders.find((o) => o.id === id)
  if (!order) throw new Error('兑换订单不存在')
  if (order.status !== 'shipped') throw new Error('仅已发货订单可标记完成')
  order.status = 'finished'
  order.finishedAt = formatNow()
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/mall/redemption-orders/:id/cancel — 取消订单（仅待发货可取消）：
 * 退回积分（复用 POST /api/admin/points-records 写流水）并回补商品库存；真实实现为服务端事务 */
export async function cancelRedemptionOrder(id: string): Promise<{ code: number }> {
  await delay(450)
  const order = redemptionOrders.find((o) => o.id === id)
  if (!order) throw new Error('兑换订单不存在')
  if (order.status !== 'pending_shipment') throw new Error('仅待发货订单可取消')
  await adjustPoints(order.userId, order.points, `订单取消退回积分（${order.id}）`)
  order.status = 'cancelled'
  const item = goods.find((g) => g.id === order.goodsId)
  if (item) {
    item.stock += 1
    item.redeemedCount = Math.max(0, item.redeemedCount - 1)
  }
  return { code: 0 }
}

/* ---------- 积分规则 ---------- */

/* TODO: 替换为 GET /api/admin/mall/points-rules — 积分规则列表（触发项写死，按 code 排序） */
export async function fetchPointsRules(): Promise<PointsRule[]> {
  await delay(300)
  return [...pointsRules].sort((a, b) => a.code.localeCompare(b.code))
}

/* TODO: 替换为 PUT /api/admin/mall/points-rules/:code — 编辑积分值（触发项/方向/名称写死不可改） */
export async function updatePointsRule(
  code: string,
  payload: { points: number },
): Promise<{ code: number }> {
  await delay(400)
  const rule = pointsRules.find((r) => r.code === code)
  if (!rule) throw new Error('积分规则不存在')
  if (!Number.isInteger(payload.points) || payload.points <= 0)
    throw new Error('积分值必须为正整数')
  rule.points = payload.points
  rule.updatedAt = formatNow()
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/mall/points-rules/:code/toggle-status — 启用/停用规则 */
export async function togglePointsRuleStatus(code: string): Promise<{ code: number }> {
  await delay(350)
  const rule = pointsRules.find((r) => r.code === code)
  if (!rule) throw new Error('积分规则不存在')
  rule.status = rule.status === 'enabled' ? 'disabled' : 'enabled'
  rule.updatedAt = formatNow()
  return { code: 0 }
}

/* ---------- 积分流水（商城侧全量视图） ---------- */

/* TODO: 替换为 GET /api/admin/mall/points-issuance — 积分发放记录（仅规则自动发放，最新在前）；
 * 手动调整/兑换扣减不属于发放记录（分别见用户详情积分流水与订单） */
export async function fetchPointsIssuanceRecords(): Promise<PointsRecord[]> {
  await delay(300)
  return pointsRecords
    .filter((r) => r.source === 'rule')
    .sort((a, b) => b.at.localeCompare(a.at))
}
