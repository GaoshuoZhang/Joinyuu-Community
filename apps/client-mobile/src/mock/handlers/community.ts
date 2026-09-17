import type { CommunityPolicy, EnterpriseRecord, TalentCard, TalentMember } from '@/types'
import { accounts, communityPolicies, enterpriseExperienceByEid, enterprises, individualShowcases, talentMembers } from '@/mock/db'
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

/* [MOCK-ONLY] 用户协议 / 隐私政策（接入期由运营发布版本化文本，见 /api/app/policies/:kind） */
const AGREEMENT_POLICIES = {
  user_agreement: {
    kind: 'user_agreement',
    title: '聚屿社区用户协议',
    version: 'v1.0',
    publishedAt: '2026-09-15 10:00',
    content:
      '<h2>一、服务说明</h2><p>聚屿社区为创业社区成员提供需求对接、活动报名、空间预约、内容投稿与积分兑换等服务。使用本服务前，请完整阅读并同意本协议。</p><h2>二、账号与身份</h2><p>注册需提供手机号；社区个体 / 社区企业等身份需经社区运营审核。你应对账号下的一切行为负责，不得冒用他人身份或企业资质。</p><h2>三、内容与行为规范</h2><p>发布的需求、响应、投稿与名片内容应真实合规；禁止虚假信息、骚扰、侵权与违规经营。违规内容将被下架，情节严重者限制或终止服务。</p>',
  },
  privacy_policy: {
    kind: 'privacy_policy',
    title: '聚屿社区隐私政策',
    version: 'v1.0',
    publishedAt: '2026-09-15 10:00',
    content:
      '<h2>一、信息收集与使用</h2><p>我们仅收集提供服务所必需的信息：手机号（登录与通知）、昵称与头像（展示）、实名信息（身份核验）、收货地址（实物兑换邮寄）。</p><h2>二、信息共享</h2><p>除法律法规要求或你另行同意外，我们不会向第三方共享你的个人信息。</p><h2>三、你的权利</h2><p>你可以随时在「账号与安全」中申请数据导出、撤回同意或申请注销账号。</p>',
  },
} as const

export async function fetchAgreementPolicy(kind: 'user_agreement' | 'privacy_policy'): Promise<import('@/types').AgreementPolicy> {
  return withLatency(() => ({ ...AGREEMENT_POLICIES[kind] }), 120)
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
    /* [MOCK-ONLY] v35 名片字段可见性：按保存的公开设置过滤敏感字段 */
    const visibility = base.visibility ?? { age: true, politicalStatus: true }
    return {
      uid,
      name: base.displayName,
      avatar: account?.avatar,
      level: identity?.level,
      levelName: identity?.levelName,
      age: visibility.age ? base.age : undefined,
      politicalStatus: visibility.politicalStatus ? base.politicalStatus : undefined,
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
    return enterprises
      .filter(
        (e) => matchKeyword(e.name + e.description + e.members.map((m) => m.name).join(''), kw) && matchKeyword(e.industry, query.industry),
      )
      .map((e) => {
        const exp = enterpriseExperienceByEid[e.id]
        return exp ? { ...e, level: exp.level, levelName: exp.levelName } : e
      })
  }, 150)
}
