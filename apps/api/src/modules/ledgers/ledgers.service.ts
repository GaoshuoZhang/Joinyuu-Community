import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'

/* 经验值/积分账本（wiki-backend.md §7.9）：
 * 手动调整走事务（余额更新 + 流水写入 source=manual、operator=登录管理员）。
 * 经验调整无审计（M0 口径）；积分调整写审计（积分商城/积分调整）。 */
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

    return this.prisma.$transaction(async (tx) => {
      let balance: number
      if (targetType === 'enterprise') {
        const enterprise = await tx.enterprise.findUnique({ where: { id: targetId } })
        if (!enterprise) throw new NotFoundException('企业不存在')
        balance = enterprise.experience + delta
        if (balance < 0) throw new BadRequestException('扣减后经验值不能为负')
        await tx.enterprise.update({ where: { id: targetId }, data: { experience: balance } })
      } else {
        const identity = await tx.userIdentity.findFirst({
          where: { userId: targetId, type: 'community_individual' },
        })
        if (!identity) throw new NotFoundException('该用户的社区个体身份不存在')
        balance = (identity.experience ?? 0) + delta
        if (balance < 0) throw new BadRequestException('扣减后经验值不能为负')
        await tx.userIdentity.update({
          where: { id: identity.id },
          data: { experience: balance },
        })
      }

      await tx.experienceRecord.create({
        data: {
          id: await this.ids.next('EX'),
          targetType,
          targetId,
          delta,
          balance,
          reason,
          at: formatNow(),
          operator,
          source: 'manual',
        },
      })

      return { code: 0, balance }
    })
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

    const { balance, nickname } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { uid: userId } })
      if (!user) throw new NotFoundException('用户不存在')
      const newBalance = user.points + delta
      if (newBalance < 0) throw new BadRequestException('扣减后积分不能为负')
      await tx.user.update({ where: { uid: userId }, data: { points: newBalance } })
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
