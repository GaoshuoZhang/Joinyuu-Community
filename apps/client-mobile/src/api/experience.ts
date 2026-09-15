import { apiMode, httpGet } from './http'
import type { ExperienceProfile, IdentityType } from '@/types'
import * as mock from '@/mock/handlers/experience'

/** [MOCK-ONLY] GET /api/app/me/experience-records — 经验值流水（缺口 §7-7）。
 * 按当前身份取数：社区个体→个人经验；社区企业→企业经验；个人用户/合作企业→空。 */
export async function fetchExperience(identityType?: IdentityType): Promise<ExperienceProfile> {
  if (apiMode === 'mock') return mock.fetchExperience(identityType)
  return httpGet(`/me/experience-records${identityType ? `?identity=${identityType}` : ''}`)
}
