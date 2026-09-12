import { apiMode, httpGet } from './http'
import type { ExperienceRecord } from '@/types'
import * as mock from '@/mock/handlers/experience'

/** [MOCK-ONLY] GET /api/app/me/experience-records — 经验值流水（缺口 §7-7，设计稿未单列） */
export async function fetchExperience(): Promise<{
  identityLabel: string
  level: number
  levelName: string
  nextLevelExp: number
  records: ExperienceRecord[]
}> {
  if (apiMode === 'mock') return mock.fetchExperience()
  return httpGet('/me/experience-records')
}
