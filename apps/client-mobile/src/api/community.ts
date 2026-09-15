import { apiMode, httpGet } from './http'
import type { CommunityPolicy, EnterpriseRecord, TalentCard, TalentMember } from '@/types'
import * as mock from '@/mock/handlers/community'

/* 社区域契约（社区服务 / 人才库 / 企业库）。
 * [MOCK-ONLY]：社区服务与人才库为当前后端边界外，接入期补充 /api/app/** 端点（见 m2-client-plan §7.1）。
 * http 分支 query 接线在接入期一并实现（httpGet 暂不支持 params）。 */

export async function fetchPolicies(params?: { keyword?: string; category?: string }): Promise<CommunityPolicy[]> {
  if (apiMode === 'mock') return mock.fetchPolicies(params)
  return httpGet<CommunityPolicy[]>('/community/policies')
}

export async function fetchTalents(params?: { keyword?: string }): Promise<TalentMember[]> {
  if (apiMode === 'mock') return mock.fetchTalents(params)
  return httpGet<TalentMember[]>('/community/talents')
}

/** GET /api/app/community/talents/:uid — 公开人才名片（简历式，人才库点入） */
export async function fetchTalentCard(uid: string): Promise<TalentCard> {
  if (apiMode === 'mock') return mock.fetchTalentCard(uid)
  return httpGet<TalentCard>(`/community/talents/${uid}`)
}

export async function fetchEnterpriseList(params?: { keyword?: string; industry?: string }): Promise<EnterpriseRecord[]> {
  if (apiMode === 'mock') return mock.fetchEnterpriseList(params)
  return httpGet<EnterpriseRecord[]>('/community/enterprises')
}