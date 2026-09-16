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
    const rule = (await this.pointsRules()).find((r) => r.code === code)
    if (!rule || rule.status !== 'enabled') return

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({ where: { uid: userId }, data: { points: { increment: rule.points } } })
        await tx.pointsRecord.create({
          data: {
            id: await this.ids.next('PT'),
            userId,
            delta: rule.points,
            balance: user.points,
            reason,
            at: formatNow(),
            operator: '系统',
            source: 'rule',
            dedupeKey: dedupeKey ?? null,
          },
        })
      })
    } catch (error) {
      if (dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
      throw error
    }
  }

  /** 为社区企业（enterprise）或社区个体身份（individual）发放经验值；规则缺失/停用则 no-op */
  async issueExperience(
    targetType: 'enterprise' | 'individual',
    targetId: string,
    code: string,
    reason: string,
  ): Promise<void> {
    const rule = (await this.experienceRules()).find((r) => r.code === code)
    if (!rule || rule.status !== 'enabled') return

    /* 等级梯度在事务外读取（只读缓存，不依赖事务内状态） */
    const tiers = await this.levelTiers()

    await this.prisma.$transaction(async (tx) => {
      if (targetType === 'enterprise') {
        const enterprise = await tx.enterprise.findUnique({ where: { id: targetId } })
        if (!enterprise) return
        const balance = enterprise.experience + rule.exp
        const level = this.resolveLevel(tiers, balance)
        await tx.enterprise.update({ where: { id: targetId }, data: { experience: balance } })
        await tx.userIdentity.updateMany({
          where: { type: 'community_enterprise', enterpriseId: targetId },
          data: { level },
        })
        await tx.experienceRecord.create({
          data: {
            id: await this.ids.next('EX'),
            targetType: 'enterprise',
            targetId,
            delta: rule.exp,
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
      const balance = (identity.experience ?? 0) + rule.exp
      const level = this.resolveLevel(tiers, balance)
      await tx.userIdentity.update({
        where: { id: identity.id },
        data: { experience: balance, level },
      })
      await tx.experienceRecord.create({
        data: {
          id: await this.ids.next('EX'),
          targetType: 'individual',
          targetId,
          delta: rule.exp,
          balance,
          reason,
          at: formatNow(),
          operator: '系统',
          source: 'rule',
        },
      })
    })
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
  private async levelTiers(): Promise<LevelTier[]> {
    const tiers = await this.redis.remember(CACHE_KEYS.levelTiers, CACHE_TTL.stable, () =>
      this.prisma.levelTier.findMany({ orderBy: { level: 'asc' } }),
    )
    return [...tiers].sort((a, b) => b.threshold - a.threshold)
  }

  /** 门槛最高的、threshold <= experience 的等级（无匹配则最低 1 级） */
  private resolveLevel(tiers: Array<{ level: number; threshold: number }>, experience: number): number {
    const tier = tiers.find((t) => t.threshold <= experience)
    return tier ? tier.level : 1
  }
}
