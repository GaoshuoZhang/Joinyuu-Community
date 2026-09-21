import { apiMode, httpGet } from './http'
import type { AgreementPolicy, CommunityPolicy, EnterpriseRecord, TalentCard, TalentMember } from '@/types'

/** GET /api/app/policies/:kind — 已发布的用户协议 / 隐私政策（注册与政策页） */
export async function fetchAgreementPolicy(kind: 'user_agreement' | 'privacy_policy'): Promise<AgreementPolicy> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/community')).fetchAgreementPolicy(kind)
  return httpGet<AgreementPolicy>(`/policies/${kind}`)
}

/* 社区域契约（社区服务 / 人才库 / 企业库）。
 * HTTP 模式读取社区政策、人才库和企业库真实端点；Mock 模式保留演示数据。
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
  if (apiMode === 'mock') return (await import('@/mock/handlers/community')).fetchPolicies(params)
  return httpGet<CommunityPolicy[]>(`/community/policies${toQuery(params)}`)
}

export async function fetchTalents(params?: { keyword?: string }): Promise<TalentMember[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/community')).fetchTalents(params)
  return httpGet<TalentMember[]>(`/community/talents${toQuery(params)}`)
}

/** GET /api/app/community/talents/:uid — 公开人才名片（简历式，人才库点入） */
export async function fetchTalentCard(uid: string): Promise<TalentCard> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/community')).fetchTalentCard(uid)
  return httpGet<TalentCard>(`/community/talents/${uid}`)
}

export async function fetchEnterpriseList(params?: { keyword?: string; industry?: string }): Promise<EnterpriseRecord[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/community')).fetchEnterpriseList(params)
  return httpGet<EnterpriseRecord[]>(`/community/enterprises${toQuery(params)}`)
}
