import { apiMode, httpGet, httpPost } from './http'
import type { Demand, DemandKind, DemandCreatePayload, DemandMessage, MyDemandItem, MyResponseItem, PageQuery } from '@/types'
import * as mock from '@/mock/handlers/demands'

/** GET /api/app/demands — 需求广场（published；可见范围过滤为缺口 §7-9，Mock 前端模拟） */
export async function fetchDemands(query: PageQuery & { category?: string; kind?: DemandKind; sort?: 'latest' | 'hot' } = {}): Promise<{ list: Demand[]; total: number }> {
  if (apiMode === 'mock') return mock.fetchDemands(query)
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.category) qs.set('category', query.category)
  if (query.kind) qs.set('kind', query.kind)
  if (query.sort && query.sort !== 'latest') qs.set('sort', query.sort)
  return httpGet(`/demands?${qs}`)
}

/** GET /api/app/demands/:id — 详情（不可见 → 404） */
export async function fetchDemand(id: string): Promise<Demand> {
  if (apiMode === 'mock') return mock.fetchDemand(id)
  return httpGet<Demand>(`/demands/${id}`)
}

/** POST /api/app/demands — 提交需求（demandOpen 开关校验；提交即 pending） */
export async function createDemand(payload: DemandCreatePayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.createDemand(payload)
  return httpPost<{ id: string }>('/demands', payload)
}

/** GET /api/app/me/demands — 我发布的需求（全状态） */
export async function fetchMyDemands(): Promise<MyDemandItem[]> {
  if (apiMode === 'mock') return mock.fetchMyDemands()
  return httpGet<MyDemandItem[]>('/me/demands')
}

/** POST /api/app/demands/:id/respond — 响应需求（触发 demand_responded 积分） */
export async function respondDemand(id: string, note: string, asEnterpriseId?: string): Promise<void> {
  if (apiMode === 'mock') return mock.respondDemand(id, note, asEnterpriseId)
  await httpPost(`/demands/${id}/respond`, { note, asEnterpriseId })
}

/** GET /api/app/demands/:id/messages — 需求沟通消息（v42 [MOCK-ONLY]，参与双方可见） */
export async function fetchDemandMessages(id: string): Promise<DemandMessage[]> {
  if (apiMode === 'mock') return mock.fetchDemandMessages(id)
  return httpGet<DemandMessage[]>(`/demands/${id}/messages`)
}

/** POST /api/app/demands/:id/messages — 发送沟通消息 */
export async function sendDemandMessage(id: string, content: string): Promise<void> {
  if (apiMode === 'mock') return mock.sendDemandMessage(id, content)
  await httpPost(`/demands/${id}/messages`, { content })
}

/** GET /api/app/me/responses — 我的响应记录 */
export async function fetchMyResponses(): Promise<MyResponseItem[]> {
  if (apiMode === 'mock') return mock.fetchMyResponses()
  return httpGet<MyResponseItem[]>('/me/responses')
}

/** [MOCK-ONLY] 响应者撤回待处理响应（撤回后可重新响应）。 */
export async function withdrawDemandResponse(responseId: string): Promise<void> {
  if (apiMode === 'mock') return mock.withdrawDemandResponse(responseId)
  await httpPost(`/me/responses/${responseId}/withdraw`)
}

/** [MOCK-ONLY] 撤回审核中的需求。 */
export async function withdrawDemand(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.withdrawDemand(id)
  await httpPost(`/me/demands/${id}/withdraw`)
}

/** [MOCK-ONLY] 驳回/撤回后修改重提。 */
export async function resubmitDemand(id: string, payload: DemandCreatePayload): Promise<void> {
  if (apiMode === 'mock') return mock.resubmitDemand(id, payload)
  await httpPost(`/me/demands/${id}/resubmit`, payload)
}

/** [MOCK-ONLY] 重提前回填需求原始载荷。 */
export async function fetchMyDemandPayload(id: string): Promise<DemandCreatePayload> {
  if (apiMode === 'mock') return mock.fetchMyDemandPayload(id)
  return httpGet<DemandCreatePayload>(`/me/demands/${id}/payload`)
}

/** [MOCK-ONLY] 驳回后申诉（一次性）。 */
export async function appealDemand(id: string, reason: string): Promise<void> {
  if (apiMode === 'mock') return mock.appealDemand(id, reason)
  await httpPost(`/me/demands/${id}/appeal`, { reason })
}

/** [MOCK-ONLY] 需求发布者查看响应；真实 /api/app 接入时补正式端点。 */
export async function fetchDemandResponses(id: string): Promise<MyResponseItem[]> {
  if (apiMode === 'mock') return mock.fetchDemandResponses(id)
  return httpGet<MyResponseItem[]>(`/me/demands/${id}/responses`)
}

/** [MOCK-ONLY] 需求发布者处理响应；接受后生成协作项目。 */
export async function reviewDemandResponse(id: string, responseId: string, action: 'accept' | 'reject', reason?: string): Promise<void> {
  if (apiMode === 'mock') return mock.reviewDemandResponse(id, responseId, action, reason)
  await httpPost(`/me/demands/${id}/responses/${responseId}/review`, { action, reason })
}

export type { PageQuery }
