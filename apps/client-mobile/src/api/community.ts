import { apiMode, httpGet, httpPost } from './http'
import type { CommunityPolicy, EnterpriseRecord, ServiceApplication, TalentCard, TalentMember } from '@/types'
import * as mock from '@/mock/handlers/community'

/* 社区域契约（社区服务 / 人才库 / 企业库）。
 * [MOCK-ONLY]：社区服务与人才库为当前后端边界外，接入期补充 /api/app/** 端点（见 m2-client-plan §7.1）。
 * v40：http 分支补齐 query 接线（keyword/category/industry），与 Mock 行为一致。 */

function toQuery(params?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) qs.set(key, value)
  }
  const text = qs.toString()
  return text ? `?${text}` : ''
}

export async function fetchPolicies(params?: { keyword?: string; category?: string }): Promise<CommunityPolicy[]> {
  if (apiMode === 'mock') return mock.fetchPolicies(params)
  return httpGet<CommunityPolicy[]>(`/community/policies${toQuery(params)}`)
}

export async function fetchTalents(params?: { keyword?: string }): Promise<TalentMember[]> {
  if (apiMode === 'mock') return mock.fetchTalents(params)
  return httpGet<TalentMember[]>(`/community/talents${toQuery(params)}`)
}

/** GET /api/app/community/talents/:uid — 公开人才名片（简历式，人才库点入） */
export async function fetchTalentCard(uid: string): Promise<TalentCard> {
  if (apiMode === 'mock') return mock.fetchTalentCard(uid)
  return httpGet<TalentCard>(`/community/talents/${uid}`)
}

/** POST /api/app/community/services/:policyId/apply — 社区服务在线申请（v42 [MOCK-ONLY]） */
export async function applyCommunityService(payload: { policyId: string; applicantName: string; phone: string; note?: string }): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.applyCommunityService(payload)
  return httpPost<{ id: string }>(`/community/services/${payload.policyId}/apply`, payload)
}

/** GET /api/app/me/service-applications — 我的服务申请 */
export async function listMyServiceApplications(): Promise<ServiceApplication[]> {
  if (apiMode === 'mock') return mock.listMyServiceApplications()
  return httpGet<ServiceApplication[]>('/me/service-applications')
}

export async function fetchEnterpriseList(params?: { keyword?: string; industry?: string }): Promise<EnterpriseRecord[]> {
  if (apiMode === 'mock') return mock.fetchEnterpriseList(params)
  return httpGet<EnterpriseRecord[]>(`/community/enterprises${toQuery(params)}`)
}
