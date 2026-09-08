import type { ExperienceRecord, PointsRecord } from '@/types'
import { enterprises, experienceRecords, pointsRecords, users } from '@/mock'
import { delay } from './utils'

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* TODO: 替换为 GET /api/admin/experience-records?targetType&targetId — 经验值流水（最新在前） */
export async function fetchExperienceRecords(
  targetType: 'enterprise' | 'individual',
  targetId: string,
): Promise<ExperienceRecord[]> {
  await delay(300)
  return experienceRecords
    .filter((r) => r.targetType === targetType && r.targetId === targetId)
    .sort((a, b) => b.at.localeCompare(a.at))
}

/* TODO: 替换为 POST /api/admin/experience-records — 为社区企业/社区个人增减经验值，入参 { delta, reason }
 * delta 正=增加、负=扣减；余额不足扣减时报错 */
export async function adjustExperience(
  targetType: 'enterprise' | 'individual',
  targetId: string,
  delta: number,
  reason: string,
): Promise<{ code: number; balance: number }> {
  await delay(400)
  if (!Number.isInteger(delta) || delta === 0) throw new Error('变动值须为非零整数')
  let balance: number
  if (targetType === 'enterprise') {
    const enterprise = enterprises.find((e) => e.id === targetId)
    if (!enterprise) throw new Error('企业不存在')
    balance = (enterprise.experience ?? 0) + delta
    if (balance < 0) throw new Error('扣减后经验值不能为负')
    enterprise.experience = balance
  } else {
    const user = users.find((u) => u.uid === targetId)
    const identity = user?.identities.find((i) => i.type === 'community_individual')
    if (!user || !identity) throw new Error('该用户的社区个人身份不存在')
    balance = (identity.experience ?? 0) + delta
    if (balance < 0) throw new Error('扣减后经验值不能为负')
    identity.experience = balance
  }
  const maxNum = experienceRecords.reduce((m, r) => Math.max(m, Number(r.id.replace('EX', ''))), 0)
  experienceRecords.push({
    id: `EX${maxNum + 1}`,
    targetType,
    targetId,
    delta,
    balance,
    reason,
    at: formatNow(),
    operator: '社区管理员',
  })
  return { code: 0, balance }
}

/* TODO: 替换为 GET /api/admin/points-records?userId — 积分流水（最新在前） */
export async function fetchPointsRecords(userId: string): Promise<PointsRecord[]> {
  await delay(300)
  return pointsRecords.filter((r) => r.userId === userId).sort((a, b) => b.at.localeCompare(a.at))
}

/* TODO: 替换为 POST /api/admin/points-records — 为用户增减积分，入参 { delta, reason }
 * 积分挂靠个人用户身份；delta 正=增加、负=扣减（兑换） */
export async function adjustPoints(
  userId: string,
  delta: number,
  reason: string,
): Promise<{ code: number; balance: number }> {
  await delay(400)
  if (!Number.isInteger(delta) || delta === 0) throw new Error('变动值须为非零整数')
  const user = users.find((u) => u.uid === userId)
  if (!user) throw new Error('用户不存在')
  const balance = user.points + delta
  if (balance < 0) throw new Error('扣减后积分不能为负')
  user.points = balance
  const maxNum = pointsRecords.reduce((m, r) => Math.max(m, Number(r.id.replace('PT', ''))), 0)
  pointsRecords.push({
    id: `PT${maxNum + 1}`,
    userId,
    delta,
    balance,
    reason,
    at: formatNow(),
    operator: '社区管理员',
  })
  return { code: 0, balance }
}
