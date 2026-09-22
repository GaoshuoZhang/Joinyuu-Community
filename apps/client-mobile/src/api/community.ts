import { httpGet } from './http'
import type { AgreementPolicy, CommunityPolicy, EnterpriseRecord, TalentCard, TalentMember } from '@/types'

/** GET /api/app/policies/:kind — 已发布的用户协议 / 隐私政策（注册与政策页） */
export async function fetchAgreementPolicy(kind: 'user_agreement' | 'privacy_policy'): Promise<AgreementPolicy> {
  return httpGet<AgreementPolicy>(`/policies/${kind}`)
}

/* 社区域契约（社区服务 / 人才库 / 企业库）。
 * v40：query 接线（keyword/category/industry）与服务端口径一致。 */

function toQuery(params?: Record<string, string | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) qs.set(key, value)
  }
  const text = qs.toString()
  return text ? `?${text}` : ''
}

export async function fetchPolicies(params?: { keyword?: string; category?: string }): Promise<CommunityPolicy[]> {
  return httpGet<CommunityPolicy[]>(`/community/policies${toQuery(params)}`)
}

export async function fetchTalents(params?: { keyword?: string }): Promise<TalentMember[]> {
  return httpGet<TalentMember[]>(`/community/talents${toQuery(params)}`)
}

/** GET /api/app/community/talents/:uid — 公开人才名片（简历式，人才库点入） */
export async function fetchTalentCard(uid: string): Promise<TalentCard> {
  return httpGet<TalentCard>(`/community/talents/${uid}`)
}

export async function fetchEnterpriseList(params?: { keyword?: string; industry?: string }): Promise<EnterpriseRecord[]> {
  return httpGet<EnterpriseRecord[]>(`/community/enterprises${toQuery(params)}`)
}
