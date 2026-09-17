import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { formatToday } from '../utils/time'

export const PUBLISHING_ACTIONS = ['demand_publish', 'article_publish', 'event_enroll', 'space_reserve'] as const
export type PublishingAction = typeof PUBLISHING_ACTIONS[number]
export type PublishingIdentity = 'personal_unverified' | 'personal_verified' | 'community_individual' | 'community_enterprise'

interface PublishingSubject {
  identityType: PublishingIdentity
  level: number
  subjectType: 'user' | 'enterprise'
  subjectId: string
}

async function resolveSubject(
  tx: Prisma.TransactionClient,
  uid: string,
  requested?: { identityType?: string; enterpriseId?: string },
): Promise<{ verified: boolean; subject: PublishingSubject }> {
  const user = await tx.user.findUniqueOrThrow({ where: { uid }, include: { identities: true } })
  const verified = !!user.realName && !!user.citizenId

  if (requested?.enterpriseId || requested?.identityType === 'community_enterprise') {
    const enterpriseId = requested.enterpriseId
    const membership = user.identities.find(i => i.type === 'community_enterprise' && (!enterpriseId || i.enterpriseId === enterpriseId))
    if (!membership?.enterpriseId) throw new ForbiddenException('请选择可用的社区企业身份')
    const enterprise = await tx.enterprise.findUniqueOrThrow({ where: { id: membership.enterpriseId } })
    const tiers = await tx.levelTier.findMany({ where: { identityType: 'community_enterprise' }, orderBy: { threshold: 'desc' } })
    const level = tiers.find(t => t.threshold <= enterprise.experience)?.level ?? 1
    await tx.userIdentity.updateMany({
      where: { type: 'community_enterprise', enterpriseId: enterprise.id },
      data: { experience: enterprise.experience, level },
    })
    return { verified, subject: { identityType: 'community_enterprise', level, subjectType: 'enterprise', subjectId: enterprise.id } }
  }

  const individual = user.identities.find(i => i.type === 'community_individual')
  if (requested?.identityType === 'community_individual' || (!requested?.identityType && individual)) {
    if (!individual) throw new ForbiddenException('社区个体身份不存在')
    const tiers = await tx.levelTier.findMany({ where: { identityType: 'community_individual' }, orderBy: { threshold: 'desc' } })
    const level = tiers.find(t => t.threshold <= (individual.experience ?? 0))?.level ?? 1
    if (individual.level !== level) await tx.userIdentity.update({ where: { id: individual.id }, data: { level } })
    return { verified, subject: { identityType: 'community_individual', level, subjectType: 'user', subjectId: uid } }
  }

  return { verified, subject: {
    identityType: verified ? 'personal_verified' : 'personal_unverified',
    level: 0,
    subjectType: 'user',
    subjectId: uid,
  } }
}

export async function currentPublishingLimits(
  tx: Prisma.TransactionClient,
  uid: string,
  requested?: { identityType?: string; enterpriseId?: string },
) {
  const { verified, subject } = await resolveSubject(tx, uid, requested)
  const [rules, activeRules] = await Promise.all([
    tx.publishingLimitRule.findMany({ orderBy: [{ identityType: 'asc' }, { level: 'asc' }, { action: 'asc' }] }),
    tx.publishingLimitRule.findMany({ where: { identityType: subject.identityType, level: subject.level }, orderBy: { action: 'asc' } }),
  ])
  return { verified, subject, rules, activeRules }
}

/** Occupies one daily action slot in the business transaction. Failed writes roll the slot back. */
export async function consumePublishingLimit(
  tx: Prisma.TransactionClient,
  uid: string,
  action: PublishingAction,
  requested?: { identityType?: string; enterpriseId?: string },
) {
  const { verified, subject, activeRules } = await currentPublishingLimits(tx, uid, requested)
  const config = await tx.systemConfig.findUnique({ where: { id: 1 }, select: { realnameRequired: true } })
  if (!verified && config?.realnameRequired) throw new ForbiddenException('请先完成实名认证后再提交')
  const rule = activeRules.find(item => item.action === action)
  const limit = rule?.dailyLimit ?? -1
  const lockKey = `publishing-limit:${subject.subjectType}:${subject.subjectId}:${action}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
  const key = { subjectType: subject.subjectType, subjectId: subject.subjectId, action, date: formatToday() }
  const usage = await tx.publishingLimitUsage.findUnique({ where: { subjectType_subjectId_action_date: key } })
  if (limit >= 0 && (usage?.count ?? 0) >= limit) throw new ForbiddenException('今日操作额度已用尽，请明日再试')
  await tx.publishingLimitUsage.upsert({
    where: { subjectType_subjectId_action_date: key },
    create: { ...key, count: 1 },
    update: { count: { increment: 1 } },
  })
}
