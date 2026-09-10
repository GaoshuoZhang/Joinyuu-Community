import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Enterprise, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { buildUserDto, type UserDto } from '../users/user.mapper'
import type { QueryEnterprisesDto } from './dto/query-enterprises.dto'
import type { ReviewShowcaseDto } from './dto/review-showcase.dto'

export interface EnterpriseDto {
  id: string
  name: string
  industry: string
  stage: string
  size: string
  foundedAt: string
  settledAt: string | null
  leaseType: string
  status: string
  showcaseStatus: string
  showcaseComment?: string
  experience: number
  contactName: string
  contactPhone: string
  contactEmail?: string
  description: string
  tags: string[]
}

export function toEnterpriseDto(e: Enterprise): EnterpriseDto {
  const dto: EnterpriseDto = {
    id: e.id,
    name: e.name,
    industry: e.industry,
    stage: e.stage,
    size: e.size,
    foundedAt: e.foundedAt,
    settledAt: e.settledAt,
    leaseType: e.leaseType,
    status: e.status,
    showcaseStatus: e.showcaseStatus,
    experience: e.experience,
    contactName: e.contactName,
    contactPhone: e.contactPhone,
    description: e.description,
    tags: e.tags,
  }
  if (e.showcaseComment != null) dto.showcaseComment = e.showcaseComment
  if (e.contactEmail != null) dto.contactEmail = e.contactEmail
  return dto
}

/* 社区企业域（wiki-backend.md §7.3）：列表/选项/详情（含派生成员）/展示页审核/数据概览 */
@Injectable()
export class EnterprisesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryEnterprisesDto): Promise<{ list: EnterpriseDto[]; total: number }> {
    const conditions: Prisma.EnterpriseWhereInput[] = []
    if (query.keyword) {
      const kw = query.keyword.trim()
      conditions.push({
        OR: [
          { name: { contains: kw, mode: 'insensitive' } },
          { id: { contains: kw, mode: 'insensitive' } },
        ],
      })
    }
    if (query.industry) conditions.push({ industry: query.industry })
    if (query.status) conditions.push({ status: query.status })

    const where: Prisma.EnterpriseWhereInput = conditions.length ? { AND: conditions } : {}

    const [total, rows] = await Promise.all([
      this.prisma.enterprise.count({ where }),
      this.prisma.enterprise.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    return { list: rows.map(toEnterpriseDto), total }
  }

  async options(): Promise<Array<{ label: string; value: string }>> {
    const rows = await this.prisma.enterprise.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    return rows.map((e) => ({ label: `${e.name}（${e.id}）`, value: e.id }))
  }

  async detail(id: string): Promise<{ enterprise: EnterpriseDto; members: UserDto[] }> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id } })
    if (!enterprise) throw new NotFoundException('企业不存在')

    const memberUsers = await this.prisma.user.findMany({
      where: { identities: { some: { type: 'community_enterprise', enterpriseId: id } } },
      include: { identities: { orderBy: { id: 'asc' } } },
      orderBy: { uid: 'asc' },
    })
    const members = await Promise.all(memberUsers.map((u) => buildUserDto(this.prisma, u)))

    return { enterprise: toEnterpriseDto(enterprise), members }
  }

  async reviewShowcase(id: string, dto: ReviewShowcaseDto): Promise<{ code: number }> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id } })
    if (!enterprise) throw new NotFoundException('企业不存在')
    const comment = (dto.comment ?? '').trim()
    if (dto.status === 'rejected' && !comment) {
      throw new BadRequestException('请填写驳回原因')
    }
    await this.prisma.enterprise.update({
      where: { id },
      data: {
        showcaseStatus: dto.status,
        ...(dto.status === 'rejected' ? { showcaseComment: comment } : {}),
      },
    })
    return { code: 0 }
  }

  async stats(id: string): Promise<{ demandCount: number; projectCount: number }> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id } })
    if (!enterprise) throw new NotFoundException('企业不存在')

    const demands = await this.prisma.demand.findMany({
      select: { publisherIdentity: true },
    })
    const demandCount = demands.filter((d) => {
      const pi = d.publisherIdentity as { type?: string; enterpriseId?: string } | null
      return pi?.type === 'community_enterprise' && pi.enterpriseId === id
    }).length

    const projectCount = await this.prisma.project.count({
      where: { undertakers: { some: { type: 'enterprise', refId: id } } },
    })

    return { demandCount, projectCount }
  }
}
