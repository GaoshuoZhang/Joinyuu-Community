import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import type { AnalyticsDto } from './engagement.dto'

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(uid: string) {
    const [earned, spent, demands, responses, enrollments, articles, orders, checkedIn, identities, initiated] = await Promise.all([
      this.prisma.pointsRecord.aggregate({ where: { userId: uid, delta: { gt: 0 } }, _sum: { delta: true } }),
      this.prisma.pointsRecord.aggregate({ where: { userId: uid, delta: { lt: 0 } }, _sum: { delta: true } }),
      this.prisma.demand.count({ where: { publisherId: uid } }), this.prisma.demandRespondent.count({ where: { userId: uid } }),
      this.prisma.eventEnrollment.count({ where: { userId: uid } }), this.prisma.article.count({ where: { authorId: uid } }),
      this.prisma.redemptionOrder.count({ where: { userId: uid } }), this.prisma.eventEnrollment.count({ where: { userId: uid, checkedIn: true } }),
      this.prisma.userIdentity.findMany({ where: { userId: uid } }), this.prisma.demand.findMany({ where: { publisherId: uid }, select: { id: true } }),
    ])
    const enterpriseIds = identities.filter(i => i.type === 'community_enterprise' && i.enterpriseId).map(i => i.enterpriseId!)
    const projects = await this.prisma.project.count({ where: { deletedAt: null, OR: [
      { sourceDemandId: { in: initiated.map(d => d.id) } }, { undertakers: { some: { refId: { in: [uid, ...enterpriseIds] } } } },
    ] } })
    return { pointsEarned: earned._sum.delta ?? 0, pointsSpent: -(spent._sum.delta ?? 0), demands, responses, enrollments, articles, orders, projects, checkedIn,
      experience: identities.filter(i => i.type === 'community_individual').reduce((sum, i) => sum + (i.experience ?? 0), 0) }
  }

  async workbench(uid: string, enterpriseId: string) {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id: enterpriseId } })
    if (!enterprise || enterprise.deletedAt || enterprise.status !== 'active') throw new NotFoundException('企业不存在或已停用')
    if (enterprise.contactUserId !== uid && !await this.prisma.userIdentity.findFirst({ where: { userId: uid, type: 'community_enterprise', enterpriseId } })) throw new ForbiddenException('仅企业成员可查看工作台')
    const demandWhere: Prisma.DemandWhereInput = { OR: [{ publisherId: enterpriseId }, { publisherIdentity: { path: ['enterpriseId'], equals: enterpriseId } }] }
    const responseWhere: Prisma.DemandRespondentWhereInput = { responderIdentity: { path: ['enterpriseId'], equals: enterpriseId } }
    const [demands, responseCount, members, responses] = await Promise.all([
      this.prisma.demand.findMany({ where: demandWhere, select: { id: true } }), this.prisma.demandRespondent.count({ where: responseWhere }),
      this.prisma.userIdentity.findMany({ where: { type: 'community_enterprise', enterpriseId }, select: { userId: true } }),
      this.prisma.demandRespondent.findMany({ where: responseWhere, include: { demand: { select: { title: true } } }, orderBy: { id: 'desc' }, take: 10 }),
    ])
    const projectCount = await this.prisma.project.count({ where: { deletedAt: null, OR: [{ sourceDemandId: { in: demands.map(d => d.id) } }, { undertakers: { some: { type: 'enterprise', refId: enterpriseId } } }] } })
    return { enterpriseId, demandCount: demands.length, responseCount, projectCount, memberCount: new Set([...members.map(m => m.userId), ...(enterprise.contactUserId ? [enterprise.contactUserId] : [])]).size,
      recentResponses: responses.map(r => ({ id: String(r.id), demandId: r.demandId, demandTitle: r.demand.title, at: r.at })) }
  }

  async analytics(uid: string, dto: AnalyticsDto) {
    if (JSON.stringify(dto.payload ?? {}).length > 2048) throw new BadRequestException('埋点数据过大')
    await this.prisma.analyticsEvent.create({ data: { userId: uid, eventType: dto.name, payload: (dto.payload ?? {}) as Prisma.InputJsonValue } })
    return { code: 0 }
  }
}
