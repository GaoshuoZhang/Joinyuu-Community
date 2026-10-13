import { Injectable } from '@nestjs/common'
import { Prisma, type ExperienceRule, type LevelTier, type PointsRule } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { IdGeneratorService } from '../../id-generator/id-generator.service'
import { RedisService } from '../../redis/redis.service'
import { CACHE_KEYS, CACHE_TTL } from '../../redis/cache-keys'
import { formatNow } from '../../utils/time'

/* 积分/经验值发放引擎（wiki-backend.md §8.4/§8.5/§10）：
 * 规则触发项 code 写死，仅 points/exp 值与启停可编辑；规则缺失或停用 → 直接 no-op。
 * 规则与等级梯度读取走缓存（与规则管理页共用 rules:* 键，查询口径一致），写操作由规则/商城服务主动失效。
 * 发放走事务：余额 += 规则值 + 写流水（source=rule、operator=系统、balance=新余额）。
 * 经验值发放后按 LevelTier 门槛重算 level（仅社区个体/社区企业身份持有 level）。 */
@Injectable()
export class PointsEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly redis: RedisService,
  ) {}

  /** 为用户发放积分（挂靠个人用户身份）；规则缺失/停用则 no-op */
  async issuePoints(userId: string, code: string, reason: string, dedupeKey?: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.issuePointsInTransaction(tx, userId, code, reason, dedupeKey)
      })
    } catch (error) {
      if (dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
      throw error
    }
  }

  /** 在调用方事务中发放积分，用于需要“状态迁移 + 奖励 + 流水”原子提交的业务。 */
  async issuePointsInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    code: string,
    reason: string,
    dedupeKey?: string,
  ): Promise<void> {
    const rule = (await this.pointsRules()).find((r) => r.code === code)
    if (!rule || rule.status !== 'enabled') return
    if (dedupeKey && await tx.pointsRecord.findUnique({ where: { dedupeKey }, select: { id: true } })) return
    const recipientId = await this.resolvePointsRecipient(tx, userId)
    if (!recipientId) return
    const user = await tx.user.update({ where: { uid: recipientId }, data: { points: { increment: rule.points } } })
    await tx.pointsRecord.create({
      data: {
        id: await this.ids.next('PT', tx),
        userId: recipientId,
        delta: rule.points,
        balance: user.points,
        reason,
        at: formatNow(),
        operator: '系统',
        source: 'rule',
        dedupeKey: dedupeKey ?? null,
      },
    })
  }

  /** 发放业务明确指定的积分值（仍写规则流水与幂等键），用于活动级覆盖值。 */
  async issueFixedPoints(userId: string, amount: number, reason: string, dedupeKey: string): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) return
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.issueFixedPointsInTransaction(tx, userId, amount, reason, dedupeKey)
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
      throw error
    }
  }

  async issueFixedPointsInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    reason: string,
    dedupeKey: string,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) return
    if (await tx.pointsRecord.findUnique({ where: { dedupeKey }, select: { id: true } })) return
    const recipientId = await this.resolvePointsRecipient(tx, userId)
    if (!recipientId) return
    const user = await tx.user.update({ where: { uid: recipientId }, data: { points: { increment: amount } } })
    await tx.pointsRecord.create({
      data: {
        id: await this.ids.next('PT', tx),
        userId: recipientId,
        delta: amount,
        balance: user.points,
        reason,
        at: formatNow(),
        operator: '系统',
        source: 'rule',
        dedupeKey,
      },
    })
  }

  /** 为社区企业（enterprise）或社区个体身份（individual）发放经验值；规则缺失/停用则 no-op */
  async issueExperience(
    targetType: 'enterprise' | 'individual',
    targetId: string,
    code: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.issueExperienceInTransaction(tx, targetType, targetId, code, reason)
    })
  }

  /** 在调用方事务中按规则值发放经验值（规则缺失/停用则 no-op）。 */
  async issueExperienceInTransaction(
    tx: Prisma.TransactionClient,
    targetType: 'enterprise' | 'individual',
    targetId: string,
    code: string,
    reason: string,
  ): Promise<void> {
    const rule = (await this.experienceRules()).find((r) => r.code === code)
    if (!rule || rule.status !== 'enabled') return
    await this.issueExperienceAmountInTransaction(tx, targetType, targetId, rule.exp, reason)
  }

  /** 在调用方事务中按指定经验值发放（项目结项按承接占比分配等场景）；
   * 原子自增（并发不丢失）+ 写流水 + 同步身份等级快照；目标不存在或发放值非正数则 no-op。 */
  async issueExperienceAmountInTransaction(
    tx: Prisma.TransactionClient,
    targetType: 'enterprise' | 'individual',
    targetId: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0) return
    const identityType = targetType === 'enterprise' ? 'community_enterprise' : 'community_individual'
    const tiers = await this.levelTiers(identityType)

    if (targetType === 'enterprise') {
      const enterprise = await tx.enterprise.findUnique({ where: { id: targetId }, select: { id: true } })
      if (!enterprise) return
      /* 原子自增（并发安全）：同一企业被并发发放时不会互相覆盖；行锁持续到事务提交，
       * 下面的身份快照写入按自增后的新余额重算，且被同一行锁串行化 */
      const updated = await tx.enterprise.update({
        where: { id: targetId },
        data: { experience: { increment: amount } },
      })
      const balance = updated.experience
      const level = this.resolveLevel(tiers, balance)
      await tx.userIdentity.updateMany({
        where: { type: 'community_enterprise', enterpriseId: targetId },
        data: { experience: balance, level },
      })
      await tx.experienceRecord.create({
        data: {
          id: await this.ids.next('EX', tx),
          targetType: 'enterprise',
          targetId,
          delta: amount,
          balance,
          reason,
          at: formatNow(),
          operator: '系统',
          source: 'rule',
        },
      })
      return
    }

    const identity = await tx.userIdentity.findFirst({
      where: { userId: targetId, type: 'community_individual' },
    })
    if (!identity) return
    /* 原子自增（并发安全）：experience 可空，先把 NULL 归一为 0 再自增（避免 NULL + n = NULL）；
     * 等级按自增后的新余额重算，行锁串行化同一身份的并发发放 */
    if (identity.experience === null) {
      await tx.userIdentity.update({ where: { id: identity.id }, data: { experience: 0 } })
    }
    const updated = await tx.userIdentity.update({
      where: { id: identity.id },
      data: { experience: { increment: amount } },
    })
    const balance = updated.experience ?? amount
    const level = this.resolveLevel(tiers, balance)
    if (updated.level !== level) {
      await tx.userIdentity.update({ where: { id: identity.id }, data: { level } })
    }
    await tx.experienceRecord.create({
      data: {
        id: await this.ids.next('EX', tx),
        targetType: 'individual',
        targetId,
        delta: amount,
        balance,
        reason,
        at: formatNow(),
        operator: '系统',
        source: 'rule',
      },
    })
  }

  /** 项目结项经验（wiki-backend.md §8.5）：总额 = 项目 expReward ?? project_completed 规则值（启用时）；
   * 按承接占比向下取整分配（余数给首个符合条件的参与方）；仅社区企业承接方与持社区个体身份的个人承接方参与，
   * 合作企业/无社区个体身份个人/自定义承接方份额丢弃。在调用方事务内执行，无可分配参与方则 no-op。 */
  async issueProjectFinishExperienceInTransaction(
    tx: Prisma.TransactionClient,
    projectName: string,
    expReward: number | null,
    undertakers: Array<{ type: string; refId: string; share: number }>,
  ): Promise<void> {
    let total = expReward
    if (total == null) {
      const rule = (await this.experienceRules()).find((r) => r.code === 'project_completed')
      total = rule && rule.status === 'enabled' ? rule.exp : 0
    }
    if (!Number.isInteger(total) || total <= 0) return

    const individualIds = undertakers.filter((u) => u.type === 'individual').map((u) => u.refId)
    const eligibleIndividuals = new Set(
      individualIds.length
        ? (
            await tx.userIdentity.findMany({
              where: { type: 'community_individual', userId: { in: individualIds } },
              select: { userId: true },
            })
          ).map((i) => i.userId)
        : [],
    )
    const participants = undertakers.filter(
      (u) => u.type === 'enterprise' || (u.type === 'individual' && eligibleIndividuals.has(u.refId)),
    )
    if (participants.length === 0) return

    const amounts = participants.map((p) => Math.floor((total * p.share) / 100))
    amounts[0] = (amounts[0] ?? 0) + (total - amounts.reduce((s, a) => s + a, 0))

    for (const [idx, p] of participants.entries()) {
      const amount = amounts[idx] ?? 0
      if (amount <= 0) continue
      await this.issueExperienceAmountInTransaction(
        tx,
        p.type === 'enterprise' ? 'enterprise' : 'individual',
        p.refId,
        amount,
        `「${projectName}」结项经验值`,
      )
    }
  }

  /* ---------- 规则读取（缓存，查询口径与规则管理页一致） ---------- */

  private pointsRules(): Promise<PointsRule[]> {
    return this.redis.remember(CACHE_KEYS.pointsRules, CACHE_TTL.stable, () =>
      this.prisma.pointsRule.findMany({ orderBy: { code: 'asc' } }),
    )
  }

  private experienceRules(): Promise<ExperienceRule[]> {
    return this.redis.remember(CACHE_KEYS.experienceRules, CACHE_TTL.stable, () =>
      this.prisma.experienceRule.findMany({ orderBy: { code: 'asc' } }),
    )
  }

  /** 等级梯度按 threshold 降序（门槛最高的、threshold <= experience 的等级） */
  private async levelTiers(identityType: 'community_individual' | 'community_enterprise'): Promise<LevelTier[]> {
    const tiers = await this.redis.remember(CACHE_KEYS.levelTiers(identityType), CACHE_TTL.stable, () =>
      this.prisma.levelTier.findMany({ where: { identityType }, orderBy: { level: 'asc' } }),
    )
    return [...tiers].sort((a, b) => b.threshold - a.threshold)
  }

  /** 门槛最高的、threshold <= experience 的等级（无匹配则最低 1 级） */
  private resolveLevel(tiers: Array<{ level: number; threshold: number }>, experience: number): number {
    const tier = tiers.find((t) => t.threshold <= experience)
    return tier ? tier.level : 1
  }

  /** Legacy management data can retain an enterprise as its publisher ID. Points
   * remain personal, so award the enterprise contact (or first active member). */
  private async resolvePointsRecipient(tx: Prisma.TransactionClient, subjectId: string): Promise<string | null> {
    if (await tx.user.findUnique({ where: { uid: subjectId }, select: { uid: true } })) return subjectId
    const enterprise = await tx.enterprise.findUnique({ where: { id: subjectId }, select: { contactUserId: true } })
    if (!enterprise) return null
    if (enterprise.contactUserId) return enterprise.contactUserId
    const member = await tx.userIdentity.findFirst({
      where: { type: 'community_enterprise', enterpriseId: subjectId },
      select: { userId: true },
      orderBy: { id: 'asc' },
    })
    return member?.userId ?? null
  }
}
