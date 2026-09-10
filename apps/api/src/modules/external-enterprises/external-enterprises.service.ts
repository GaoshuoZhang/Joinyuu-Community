import { Injectable, NotFoundException } from '@nestjs/common'
import type { ExternalEnterpriseProfile } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import type { QueryExternalEnterprisesDto } from './dto/query-external-enterprises.dto'

export interface ExternalEnterpriseMemberDto {
  userId: string
  name: string
  title: string
  phone: string
  status: string
}

export interface ExternalEnterpriseDto {
  id: string
  name: string
  industry: string
  description: string
  cooperationCount: number
  firstCooperationAt: string
  members: ExternalEnterpriseMemberDto[]
}

/* 外部企业聚合视图（wiki-backend.md §7.4）：
 * 档案（ExternalEnterpriseProfile）+ 成员（type=external_enterprise 且 enterpriseName 匹配档案名的身份）派生 */
@Injectable()
export class ExternalEnterprisesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryExternalEnterprisesDto): Promise<{ list: ExternalEnterpriseDto[]; total: number }> {
    const profiles = await this.prisma.externalEnterpriseProfile.findMany()
    let list = await Promise.all(profiles.map((p) => this.aggregate(p)))

    if (query.keyword) {
      const kw = query.keyword.trim().toLowerCase()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(kw) ||
          e.industry.toLowerCase().includes(kw) ||
          e.id.toLowerCase().includes(kw),
      )
    }
    if (query.industry) list = list.filter((e) => e.industry === query.industry)

    const field = query.sortBy ?? 'cooperationCount'
    const dir = query.sortOrder === 'ascend' ? 1 : -1
    list.sort((a, b) => {
      const av = field === 'cooperationCount' ? a.cooperationCount : Number(a.firstCooperationAt.replace('-', ''))
      const bv = field === 'cooperationCount' ? b.cooperationCount : Number(b.firstCooperationAt.replace('-', ''))
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })

    const total = list.length
    const start = (query.page - 1) * query.pageSize
    return { list: list.slice(start, start + query.pageSize), total }
  }

  async detail(id: string): Promise<ExternalEnterpriseDto> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('外部企业不存在')
    return this.aggregate(profile)
  }

  async stats(id: string): Promise<{ demandCount: number; projectCount: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('外部企业不存在')

    const demands = await this.prisma.demand.findMany({
      select: { publisherIdentity: true },
    })
    const demandCount = demands.filter((d) => {
      const pi = d.publisherIdentity as { type?: string; enterpriseName?: string } | null
      return pi?.type === 'external_enterprise' && pi.enterpriseName === profile.name
    }).length

    const memberIds = await this.prisma.userIdentity.findMany({
      where: { type: 'external_enterprise', enterpriseName: profile.name },
      select: { userId: true },
    })
    const projectCount = await this.prisma.project.count({
      where: {
        undertakers: {
          some: { type: 'individual', refId: { in: memberIds.map((m) => m.userId) } },
        },
      },
    })

    return { demandCount, projectCount }
  }

  private async aggregate(profile: ExternalEnterpriseProfile): Promise<ExternalEnterpriseDto> {
    const identities = await this.prisma.userIdentity.findMany({
      where: { type: 'external_enterprise', enterpriseName: profile.name },
      include: { user: true },
      orderBy: [{ userId: 'asc' }, { id: 'asc' }],
    })
    const members: ExternalEnterpriseMemberDto[] = identities.map((i) => ({
      userId: i.userId,
      name: i.user.realName ?? i.user.nickname,
      title: i.title,
      phone: i.user.phone,
      status: i.user.status,
    }))
    return {
      id: profile.id,
      name: profile.name,
      industry: profile.industry,
      description: profile.description,
      cooperationCount: profile.cooperationCount,
      firstCooperationAt: profile.firstCooperationAt,
      members,
    }
  }
}
