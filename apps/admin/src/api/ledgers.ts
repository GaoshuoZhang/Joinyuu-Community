import type { ExperienceRecord, PointsRecord } from '@/types'
import { httpGet, httpPost } from './http'

/* GET /api/admin/experience-records?targetType&targetId — 经验值流水（最新在前） */
export async function fetchExperienceRecords(
  targetType: 'enterprise' | 'individual',
  targetId: string,
): Promise<ExperienceRecord[]> {
  const qs = new URLSearchParams()
  qs.set('targetType', targetType)
  qs.set('targetId', targetId)
  return httpGet<ExperienceRecord[]>(`/experience-records?${qs}`)
}

/* POST /api/admin/experience-records — 为社区企业/社区个体增减经验值，入参 { targetType, targetId, delta, reason }
 * delta 正=增加、负=扣减；余额不足扣减时报错 */
export async function adjustExperience(
  targetType: 'enterprise' | 'individual',
  targetId: string,
  delta: number,
  reason: string,
): Promise<{ code: number; balance: number }> {
  return httpPost<{ code: number; balance: number }>('/experience-records', {
    targetType,
    targetId,
    delta,
    reason,
  })
}

/* GET /api/admin/points-records?userId — 积分流水（最新在前） */
export async function fetchPointsRecords(userId: string): Promise<PointsRecord[]> {
  const qs = new URLSearchParams()
  qs.set('userId', userId)
  return httpGet<PointsRecord[]>(`/points-records?${qs}`)
}

/* POST /api/admin/points-records — 为用户增减积分，入参 { userId, delta, reason }
 * 积分挂靠个人用户身份；delta 正=增加、负=扣减（兑换） */
export async function adjustPoints(
  userId: string,
  delta: number,
  reason: string,
): Promise<{ code: number; balance: number }> {
  return httpPost<{ code: number; balance: number }>('/points-records', { userId, delta, reason })
}
