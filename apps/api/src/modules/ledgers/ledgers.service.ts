import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'

/* 单次调整上界（Int4 范围保护，与服务层校验及 DTO @Min/@Max 保持一致） */
const MAX_ADJUST_DELTA = 1_000_000_000

/* 经验值/积分账本（wiki-backend.md §7.9）：
 * 手动调整走事务（余额原子自增 + 流水写入 source=manual、operator=登录管理员）。
 * 经验值调整与积分调整均写审计。 */
@Injectable()
export class LedgersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  async findExperienceRecords(targetType: string, targetId: string) {
    return this.prisma.experienceRecord.findMany({
      where: { targetType, targetId },
      orderBy: { at: 'desc' },
    })
  }

  async adjustExperience(
    targetType: 'enterprise' | 'individual',
    targetId: string,
    delta: number,
    reason: string,
    operator: string,
  ): Promise<{ code: number; balance: number }> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestException('变动值须为非零整数')
    }
    if (Math.abs(delta) > MAX_ADJUST_DELTA) {
      throw new BadRequestException('变动值超出允许范围')
    }

    const balance = await this.prisma.$transaction(async (tx) => {
      let newBalance: number
      if (targetType === 'enterprise') {
        const enterprise = await tx.enterprise.findUnique({ where: { id: targetId }, select: { id: true } })
        if (!enterprise) throw new NotFoundException('企业不存在')
        /* 原子条件自增：扣减场景要求余额充足，并发下避免「读旧值→写绝对值」的丢失更新 */
        const updated = await tx.enterprise.updateMany({
          where: { id: targetId, ...(delta < 0 ? { experience: { gte: -delta } } : {}) },
          data: { experience: { increment: delta } },
        })
        if (updated.count !== 1) throw new BadRequestException('扣减后经验值不能为负')
        const after = await tx.enterprise.findUniqueOrThrow({ where: { id: targetId }, select: { experience: true } })
        newBalance = after.experience
        const tiers = await tx.levelTier.findMany({ where: { identityType: 'community_enterprise' }, orderBy: { threshold: 'desc' } })
        const level = tiers.find(t => t.threshold <= newBalance)?.level ?? 1
        await tx.userIdentity.updateMany({ where: { type: 'community_enterprise', enterpriseId: targetId }, data: { experience: newBalance, level } })
      } else {
        const identity = await tx.userIdentity.findFirst({
          where: { userId: targetId, type: 'community_individual' },
        })
        if (!identity) throw new NotFoundException('该用户的社区个体身份不存在')
        const updated = await tx.userIdentity.updateMany({
          where: { id: identity.id, ...(delta < 0 ? { experience: { gte: -delta } } : {}) },
          data: { experience: { increment: delta } },
        })
        if (updated.count !== 1) throw new BadRequestException('扣减后经验值不能为负')
        const after = await tx.userIdentity.findUniqueOrThrow({ where: { id: identity.id }, select: { experience: true } })
        newBalance = after.experience ?? 0
        const tiers = await tx.levelTier.findMany({ where: { identityType: 'community_individual' }, orderBy: { threshold: 'desc' } })
        const level = tiers.find(t => t.threshold <= newBalance)?.level ?? 1
        await tx.userIdentity.updateMany({ where: { id: identity.id }, data: { experience: newBalance, level } })
      }

      await tx.experienceRecord.create({
        data: {
          id: await this.ids.next('EX', tx),
          targetType,
          targetId,
          delta,
          balance: newBalance,
          reason,
          at: formatNow(),
          operator,
          source: 'manual',
        },
      })

      return newBalance
    })

    await this.audit.record({
      module: '会员治理',
      action: '经验值调整',
      target: `${targetType} · ${targetId}`,
      detail: `${delta > 0 ? '+' : ''}${delta} ${reason}`,
      before: { experience: balance - delta },
      after: { experience: balance },
      operator,
    })

    return { code: 0, balance }
  }

  async findPointsRecords(userId: string) {
    return this.prisma.pointsRecord.findMany({
      where: { userId },
      orderBy: { at: 'desc' },
    })
  }

  async adjustPoints(
    userId: string,
    delta: number,
    reason: string,
    operator: string,
  ): Promise<{ code: number; balance: number }> {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestException('变动值须为非零整数')
    }
    if (Math.abs(delta) > MAX_ADJUST_DELTA) {
      throw new BadRequestException('变动值超出允许范围')
    }

    const { balance, nickname } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { uid: userId }, select: { nickname: true } })
      if (!user) throw new NotFoundException('用户不存在')
      /* 原子条件自增：扣减场景要求余额充足，并发下避免「读旧值→写绝对值」的丢失更新 */
      const updated = await tx.user.updateMany({
        where: { uid: userId, ...(delta < 0 ? { points: { gte: -delta } } : {}) },
        data: { points: { increment: delta } },
      })
      if (updated.count !== 1) throw new BadRequestException('扣减后积分不能为负')
      const after = await tx.user.findUnique({ where: { uid: userId }, select: { points: true } })
      const newBalance = after?.points ?? 0
      await tx.pointsRecord.create({
        data: {
          id: await this.ids.next('PT'),
          userId,
          delta,
          balance: newBalance,
          reason,
          at: formatNow(),
          operator,
          source: 'manual',
        },
      })
      return { balance: newBalance, nickname: user.nickname }
    })

    await this.audit.record({
      module: '积分商城',
      action: '积分调整',
      target: `${userId} · ${nickname}`,
      detail: `${delta > 0 ? '+' : ''}${delta} ${reason}`,
      before: { points: balance - delta },
      after: { points: balance },
      operator,
    })

    return { code: 0, balance }
  }
}
