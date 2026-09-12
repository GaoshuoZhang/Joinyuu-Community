import type { CommunityPolicy, TalentMember } from '@/types'
import type { EnterpriseRecord } from '@/mock/db'
import { communityPolicies, enterprises, talentMembers } from '@/mock/db'
import { withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 社区域 handler（社区服务政策 / 人才库 / 企业库）。
 * 缺口登记：社区服务与人才库为当前后端边界外，接入期补充 /api/app/** 端点。 */

export interface CommunityPoliciesQuery { keyword?: string; category?: string }
export interface TalentQuery { keyword?: string }
export interface EnterpriseQuery { keyword?: string; industry?: string }

function matchKeyword(text: string, kw?: string): boolean {
  if (!kw) return true
  return text.includes(kw)
}

export async function fetchPolicies(query: CommunityPoliciesQuery = {}): Promise<CommunityPolicy[]> {
  return withLatency(() => {
    const kw = query.keyword?.trim() ?? ''
    return communityPolicies.filter(
      (p) =>
        matchKeyword(p.title + p.summary + p.content, kw) &&
        matchKeyword(p.category, query.category),
    )
  }, 150)
}

export async function fetchTalents(query: TalentQuery = {}): Promise<TalentMember[]> {
  return withLatency(() => {
    const kw = query.keyword?.trim() ?? ''
    if (!kw) return [...talentMembers]
    return talentMembers.filter((t) => matchKeyword(t.name + t.role + t.intro + t.skills.join(''), kw))
  }, 150)
}

export async function fetchEnterpriseList(query: EnterpriseQuery = {}): Promise<EnterpriseRecord[]> {
  return withLatency(() => {
    const kw = query.keyword?.trim() ?? ''
    return enterprises.filter(
      (e) => matchKeyword(e.name + e.description + e.members.join(''), kw) && matchKeyword(e.industry, query.industry),
    )
  }, 150)
}