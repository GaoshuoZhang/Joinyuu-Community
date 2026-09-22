import { httpGet } from './http'
import type { ExperienceProfile, IdentityType } from '@/types'

/** GET /api/app/me/experience-records — 经验值流水。
 * 按当前身份取数：社区个体→个人经验；社区企业→企业经验；个人用户/合作企业→空。 */
export async function fetchExperience(identityType?: IdentityType): Promise<ExperienceProfile> {
  return httpGet(`/me/experience-records${identityType ? `?identity=${identityType}` : ''}`)
}
