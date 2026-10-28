import type {
  PageResult,
  MallGoods,
  RedemptionOrder,
  PointsRule,
  PointsRecord,
  GoodsCategory,
} from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* ---------- 商品管理 ---------- */

export interface GoodsQuery {
  page: number
  pageSize: number
  keyword?: string
  category?: GoodsCategory | ''
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  /** 排序字段：id | points | createdAt */
  sortBy?: 'id' | 'points' | 'createdAt'
  /** 排序方向：descend 默认 | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* GET /api/admin/mall/goods?page&pageSize&keyword&category&status&sortBy&sortOrder */
export async function fetchGoods(query: GoodsQuery): Promise<PageResult<MallGoods>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.category) qs.set('category', query.category)
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<MallGoods>>(`/mall/goods?${qs}`)
}

export interface GoodsPayload {
  chargeAmountFen?: number
  chargeRefundPolicy?: string
  name: string
  coverUrl?: string
  category: GoodsCategory
  points: number
  stock: number
  /** 编辑时回传弹窗打开时的库存基线：相等 = 未调整库存，服务端跳过库存写入（避免覆盖期间下单扣减） */
  baseStock?: number
  /** 券码有效期（天）：统一券码兑换，空值按 30 天兜底 */
  validDays?: number
  description: string
  /** 自定义可见范围：身份与等级（空数组=不限） */
  visibilityIdentities?: string[]
  visibilityLevels?: string[]
  /** 自定义可下单范围：身份与等级（空数组=不限） */
  orderIdentities?: string[]
  orderLevels?: string[]
}

/* POST /api/admin/mall/goods — 新增商品（新增即下架 status=off，由列表操作上架，累计兑换次数从 0 起） */
export async function createGoods(payload: GoodsPayload): Promise<MallGoods> {
  return httpPost<MallGoods>('/mall/goods', payload)
}

/* PUT /api/admin/mall/goods/:id — 编辑商品（不影响已有兑换订单） */
export async function updateGoods(id: string, payload: GoodsPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/mall/goods/${id}`, payload)
}

/* POST /api/admin/mall/goods/:id/toggle-status — 上架/下架 */
export async function toggleGoodsStatus(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/mall/goods/${id}/toggle-status`)
}

/* POST /api/admin/mall/goods/:id/archive — 归档已下架商品（可在归档管理中恢复） */
export async function archiveGoods(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/mall/goods/${id}/archive`)
}

/* ---------- 兑换订单 ---------- */

export interface RedemptionOrderQuery {
  page: number
  pageSize: number
  keyword?: string
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  /** 排序字段：id | createdAt */
  sortBy?: 'id' | 'createdAt'
  /** 排序方向：descend 默认 | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* GET /api/admin/mall/redemption-orders?page&pageSize&keyword&status&sortBy&sortOrder */
export async function fetchRedemptionOrders(
  query: RedemptionOrderQuery,
): Promise<PageResult<RedemptionOrder>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<RedemptionOrder>>(`/mall/redemption-orders?${qs}`)
}

/* POST /api/admin/mall/redemption-orders/:id/verify — 券码核销：待使用 → 已完成 */
export async function verifyRedemptionOrder(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/mall/redemption-orders/${id}/verify`)
}

/* POST /api/admin/mall/redemption-orders/:id/archive — 归档已完成/已取消订单（可在归档管理中恢复） */
export async function archiveOrder(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/mall/redemption-orders/${id}/archive`)
}

/* POST /api/admin/mall/redemption-orders/:id/cancel — 退款（仅待使用可退）：
 * 退回积分（source=redemption 流水）+ 库存回补 + redeemedCount-1 + 记 cancelReason；真实实现为服务端事务 */
export async function cancelRedemptionOrder(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/mall/redemption-orders/${id}/cancel`)
}

/* ---------- 积分规则 ---------- */

/* GET /api/admin/mall/points-rules — 积分规则列表（触发项写死，按 code 排序） */
export async function fetchPointsRules(): Promise<PointsRule[]> {
  return httpGet<PointsRule[]>('/mall/points-rules')
}

/* PUT /api/admin/mall/points-rules/:code — 编辑积分值（触发项/方向/名称写死不可改） */
export async function updatePointsRule(
  code: string,
  payload: { points: number },
): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/mall/points-rules/${code}`, payload)
}

/* POST /api/admin/mall/points-rules/:code/toggle-status — 启用/停用规则 */
export async function togglePointsRuleStatus(code: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/mall/points-rules/${code}/toggle-status`)
}

/* ---------- 积分流水（商城侧全量视图） ---------- */

/* GET /api/admin/mall/points-issuance — 积分发放记录（仅规则自动发放，最新在前）；
 * 手动调整/兑换扣减不属于发放记录（分别见用户详情积分流水与订单） */
export async function fetchPointsIssuanceRecords(): Promise<PointsRecord[]> {
  return httpGet<PointsRecord[]>('/mall/points-issuance')
}
