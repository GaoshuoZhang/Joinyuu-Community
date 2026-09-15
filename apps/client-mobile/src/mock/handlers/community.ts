import type { CommunityPolicy, EnterpriseRecord, TalentCard, TalentMember } from '@/types'
import { accounts, communityPolicies, enterprises, individualShowcases, talentMembers } from '@/mock/db'
import type { IndividualShowcase } from '@/mock/db'
import { fail, withLatency } from '@/mock/latency'

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
    /* 头像与个人资料同步（人才库列表展示） */
    const list = talentMembers.map((t) => ({ ...t, avatar: accounts.find((a) => a.uid === t.uid)?.avatar }))
    if (!kw) return list
    return list.filter((t) => matchKeyword(t.name + t.role + t.intro + t.skills.join(''), kw))
  }, 150)
}

/** 公开人才名片（人才库点入的简历页）：存储名片优先，其次人才库种子 */
export async function fetchTalentCard(uid: string): Promise<TalentCard> {
  return withLatency(() => {
    const talent = talentMembers.find((t) => t.uid === uid)
    const account = accounts.find((a) => a.uid === uid)
    const identity = account?.identities.find((i) => i.type === 'community_individual')
    const stored = individualShowcases[uid]
    const base: Partial<IndividualShowcase> = stored ?? (talent ? { displayName: talent.name, intro: talent.intro, skills: talent.skills } : {})
    if (!base.displayName) fail(404, '人才名片不存在或未公开')
    return {
      uid,
      name: base.displayName,
      avatar: account?.avatar,
      level: identity?.level,
      levelName: identity?.levelName,
      age: base.age,
      politicalStatus: base.politicalStatus,
      intro: base.intro ?? '',
      industryExperience: base.industryExperience,
      skills: base.skills ?? [],
      education: base.education ?? [],
      work: base.work ?? [],
      projects: base.projects ?? [],
      honors: base.honors ?? [],
      socials: base.socials ?? [],
      customLinks: base.customLinks ?? [],
    }
  }, 150)
}

export async function fetchEnterpriseList(query: EnterpriseQuery = {}): Promise<EnterpriseRecord[]> {
  return withLatency(() => {
    const kw = query.keyword?.trim() ?? ''
    return enterprises.filter(
      (e) => matchKeyword(e.name + e.description + e.members.map((m) => m.name).join(''), kw) && matchKeyword(e.industry, query.industry),
    )
  }, 150)
}
