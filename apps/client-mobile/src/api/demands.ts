import { apiMode, httpGet, httpPost } from './http'
import type { Demand, DemandCreatePayload, MyDemandItem, MyResponseItem, PageQuery } from '@/types'
import * as mock from '@/mock/handlers/demands'

/** GET /api/app/demands — 需求广场（published；可见范围过滤为缺口 §7-9，Mock 前端模拟） */
export async function fetchDemands(query: PageQuery & { category?: string } = {}): Promise<{ list: Demand[]; total: number }> {
  if (apiMode === 'mock') return mock.fetchDemands(query)
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.category) qs.set('category', query.category)
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
export async function respondDemand(id: string, note: string): Promise<void> {
  if (apiMode === 'mock') return mock.respondDemand(id, note)
  await httpPost(`/demands/${id}/respond`, { note })
}

/** GET /api/app/me/responses — 我的响应记录 */
export async function fetchMyResponses(): Promise<MyResponseItem[]> {
  if (apiMode === 'mock') return mock.fetchMyResponses()
  return httpGet<MyResponseItem[]>('/me/responses')
}

export type { PageQuery }
