import type { ExperienceProfile, IdentityType } from '@/types'
import { accountByUid, enterpriseExperienceByEid, experienceByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 经验值流水 handlers（缺口 §7-7）。
 * 按当前身份取数：社区个体→个人经验（experienceByUid）；社区企业→企业经验（enterpriseExperienceByEid）；
 * 个人用户/合作企业→空（经验与积分按身份隔离）。 */

function emptyProfile(identityLabel: string): ExperienceProfile {
  return { identityLabel, level: 0, levelName: '未绑定', nextLevelExp: 0, records: [] }
}

export async function fetchExperience(identityType?: IdentityType): Promise<ExperienceProfile> {
  return withLatency(() => {
    const payload = readPayload()
    if (!payload) fail(401, '未登录或登录已过期')
    const account = accountByUid(payload.sub)
    /* 未指定身份时按个人维度取数：优先社区个体（个人经验），否则个人用户（空） */
    const active =
      identityType ?? (account?.identities.some((i) => i.type === 'community_individual') ? 'community_individual' : 'individual')
    if (active === 'community_enterprise') {
      const enterpriseId = account?.identities.find((i) => i.type === 'community_enterprise')?.enterpriseId
      const data = enterpriseId ? enterpriseExperienceByEid[enterpriseId] : undefined
      return data ?? emptyProfile('社区企业')
    }
    if (active === 'community_individual') {
      return experienceByUid[payload.sub] ?? emptyProfile('社区个体')
    }
    return emptyProfile(active === 'external_enterprise' ? '合作企业' : '个人用户')
  })
}
