import { httpGet, httpPost } from './http'
import type { Demand, DemandKind, DemandCreatePayload, IdentityType, MyDemandItem, MyResponseItem, PageQuery } from '@/types'

/** GET /api/app/demands — 需求广场；HTTP 模式由服务端执行状态和可见范围过滤（按发布时间倒序）。 */
export async function fetchDemands(query: PageQuery & { category?: string; kind?: DemandKind } = {}): Promise<{ list: Demand[]; total: number }> {
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.category) qs.set('category', query.category)
  if (query.kind) qs.set('kind', query.kind)
  return httpGet(`/demands?${qs}`)
}

/** GET /api/app/demands/:id — 详情（不可见 → 404） */
export async function fetchDemand(id: string): Promise<Demand> {
  return httpGet<Demand>(`/demands/${id}`)
}

/** POST /api/app/demands — 提交需求（demandOpen 开关校验；提交即 pending） */
export async function createDemand(payload: DemandCreatePayload): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/demands', payload)
}

/** GET /api/app/me/demands — 我发布的需求（全状态） */
export async function fetchMyDemands(): Promise<MyDemandItem[]> {
  return httpGet<MyDemandItem[]>('/me/demands')
}

/** POST /api/app/demands/:id/respond — 响应需求（须选择响应身份；触发 demand_responded 积分）。
 * 除 note 外的字段均选填：报价 / 可投入时间 / 案例 / 手机（手机留空时服务端沿用账号手机号）。 */
export async function respondDemand(
  id: string,
  payload: { note: string; quote?: string; timeline?: string; cases?: string; phone?: string; asIdentity: IdentityType; asEnterpriseId?: string },
): Promise<void> {
  await httpPost(`/demands/${id}/respond`, payload)
}

/** GET /api/app/me/responses — 我的响应记录 */
export async function fetchMyResponses(): Promise<MyResponseItem[]> {
  return httpGet<MyResponseItem[]>('/me/responses')
}

/** POST /api/app/me/responses/:id/withdraw — 撤回本人响应（仅待处理且需求发布中） */
export async function withdrawResponse(id: string): Promise<void> {
  await httpPost(`/me/responses/${id}/withdraw`)
}

/** 撤回审核中的需求。 */
export async function withdrawDemand(id: string): Promise<void> {
  await httpPost(`/me/demands/${id}/withdraw`)
}

/** 驳回/撤回后修改重提。 */
export async function resubmitDemand(id: string, payload: DemandCreatePayload): Promise<void> {
  await httpPost(`/me/demands/${id}/resubmit`, payload)
}

/** 重提前回填需求原始载荷。 */
export async function fetchMyDemandPayload(id: string): Promise<DemandCreatePayload> {
  return httpGet<DemandCreatePayload>(`/me/demands/${id}/payload`)
}

/** GET /api/app/me/demands/:id/responses — 发布者查看响应情况 */
export async function fetchDemandResponses(id: string): Promise<MyResponseItem[]> {
  return httpGet<MyResponseItem[]>(`/me/demands/${id}/responses`)
}

/** POST /api/app/me/demands/:id/select — 发布者多选意向承接方并提交立项（转 selected，管理员确认后立项） */
export async function selectDemandResponders(id: string, responseIds: string[]): Promise<void> {
  await httpPost(`/me/demands/${id}/select`, { responseIds })
}

export type { PageQuery }
