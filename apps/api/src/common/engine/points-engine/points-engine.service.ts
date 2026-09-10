import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { IdGeneratorService } from '../../id-generator/id-generator.service'
import { formatNow } from '../../utils/time'

/* 积分/经验发放引擎（wiki-backend.md §8.4/§8.5）：
 * 规则触发项 code 写死，仅 points/exp 值与启停可编辑；规则缺失或停用 → 直接 no-op。
 * 发放走事务：余额 += 规则值 + 写流水（source=rule、operator=系统、balance=新余额）。
 * 经验发放后按 LevelTier 门槛重算 level（仅社区个体/社区企业身份持有 level）。 */
@Injectable()
export class PointsEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  /** 为用户发放积分（挂靠个人用户身份）；规则缺失/停用则 no-op */
  async issuePoints(userId: string, code: string, reason: string): Promise<void> {
    const rule = await this.prisma.pointsRule.findUnique({ where: { code } })
    if (!rule || rule.status !== 'enabled') return

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { uid: userId } })
      if (!user) return
      const balance = user.points + rule.points
      await tx.user.update({ where: { uid: userId }, data: { points: balance } })
      await tx.pointsRecord.create({
        data: {
          id: await this.ids.next('PT'),
          userId,
          delta: rule.points,
          balance,
          reason,
          at: formatNow(),
          operator: '系统',
          source: 'rule',
        },
      })
    })
  }

  /** 为社区企业（enterprise）或社区个体身份（individual）发放经验值；规则缺失/停用则 no-op */
  async issueExperience(
    targetType: 'enterprise' | 'individual',
    targetId: string,
    code: string,
    reason: string,
  ): Promise<void> {
    const rule = await this.prisma.experienceRule.findUnique({ where: { code } })
    if (!rule || rule.status !== 'enabled') return

    await this.prisma.$transaction(async (tx) => {
      const tiers = await tx.levelTier.findMany({ orderBy: { threshold: 'desc' } })

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

  /** 门槛最高的、threshold <= experience 的等级（无匹配则最低 1 级） */
  private resolveLevel(tiers: Array<{ level: number; threshold: number }>, experience: number): number {
    const tier = tiers.find((t) => t.threshold <= experience)
    return tier ? tier.level : 1
  }
}
