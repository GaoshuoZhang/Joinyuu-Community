import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { ExternalEnterpriseProfile } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow } from '../../common/utils/time'
import type { QueryExternalEnterprisesDto } from './dto/query-external-enterprises.dto'
import type { CreateExternalEnterpriseDto } from './dto/create-external-enterprise.dto'
import type { UpdateExternalEnterpriseDto } from './dto/update-external-enterprise.dto'
import type { ExternalEnterpriseMemberDto as AddMemberInput } from './dto/external-enterprise-member.dto'

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
  status: string
  size: string
  foundedAt: string
  description: string
  cooperationCount: number
  firstCooperationAt: string
  members: ExternalEnterpriseMemberDto[]
}

/** 当前年月（YYYY-MM） */
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* 合作企业聚合视图（wiki-backend.md §7.4）：
 * 档案（ExternalEnterpriseProfile）+ 成员（type=external_enterprise 且 enterpriseName 匹配档案名的身份）派生 */
@Injectable()
export class ExternalEnterprisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QueryExternalEnterprisesDto): Promise<{ list: ExternalEnterpriseDto[]; total: number }> {
    const profiles = await this.prisma.externalEnterpriseProfile.findMany({
      where: { deletedAt: null },
    })
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
    if (query.status) list = list.filter((e) => e.status === query.status)

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
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({
      where: { id, deletedAt: null },
    })
    if (!profile) throw new NotFoundException('合作企业不存在')
    return this.aggregate(profile)
  }

  async create(dto: CreateExternalEnterpriseDto): Promise<{ id: string }> {
    const id = await this.ids.next('XE')
    await this.prisma.externalEnterpriseProfile.create({
      data: {
        id,
        name: dto.name.trim(),
        industry: dto.industry.trim(),
        status: 'active',
        size: dto.size ?? '',
        foundedAt: dto.foundedAt ?? '',
        description: dto.description ?? '',
        cooperationCount: 0,
        firstCooperationAt: currentMonth(),
      },
    })
    await this.audit.record({
      module: '合作企业',
      action: '新增合作企业',
      target: `${id} · ${dto.name}`,
    })
    return { id }
  }

  async update(id: string, dto: UpdateExternalEnterpriseDto): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('合作企业不存在')

    /* 改名时同步迁移已有成员身份（成员以档案名匹配） */
    const name = dto.name?.trim() ?? profile.name
    if (name !== profile.name) {
      await this.prisma.userIdentity.updateMany({
        where: { type: 'external_enterprise', enterpriseName: profile.name },
        data: { enterpriseName: name },
      })
    }

    await this.prisma.externalEnterpriseProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name } : {}),
        ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
        ...(dto.size !== undefined ? { size: dto.size } : {}),
        ...(dto.foundedAt !== undefined ? { foundedAt: dto.foundedAt } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    })
    await this.audit.record({
      module: '合作企业',
      action: '编辑合作企业',
      target: `${id} · ${profile.name}`,
    })
    return { code: 0 }
  }

  async disable(id: string): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('合作企业不存在')
    await this.prisma.externalEnterpriseProfile.update({ where: { id }, data: { status: 'disabled' } })
    await this.audit.record({
      module: '合作企业',
      action: '停用合作企业',
      target: `${id} · ${profile.name}`,
    })
    return { code: 0 }
  }

  async enable(id: string): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('合作企业不存在')
    await this.prisma.externalEnterpriseProfile.update({ where: { id }, data: { status: 'active' } })
    await this.audit.record({
      module: '合作企业',
      action: '启用合作企业',
      target: `${id} · ${profile.name}`,
    })
    return { code: 0 }
  }

  async remove(id: string, operator: string): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({
      where: { id, deletedAt: null },
    })
    if (!profile) throw new NotFoundException('合作企业不存在')

    await this.prisma.externalEnterpriseProfile.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })
    await this.audit.record({
      module: '合作企业',
      action: '归档合作企业',
      target: `${id} · ${profile.name}`,
      operator,
    })
    return { code: 0 }
  }

  async addMember(id: string, dto: AddMemberInput): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('合作企业不存在')

    const user = await this.prisma.user.findUnique({ where: { uid: dto.userId } })
    if (!user) throw new BadRequestException('用户不存在')

    /* @@unique([userId,type,enterpriseId]) 中 enterpriseId 为 null 时 unique 不生效，需手动查重 */
    const existing = await this.prisma.userIdentity.findFirst({
      where: { type: 'external_enterprise', enterpriseName: profile.name, userId: dto.userId },
    })
    if (existing) throw new ConflictException('该成员已绑定该合作企业')

    await this.prisma.userIdentity.create({
      data: {
        userId: user.uid,
        type: 'external_enterprise',
        enterpriseId: null,
        enterpriseName: profile.name,
        role: null,
        title: dto.title?.trim() || '',
      },
    })
    await this.audit.record({
      module: '合作企业',
      action: '新增关联成员',
      target: `${id} · ${profile.name}`,
      detail: `成员 UID=${user.uid}`,
    })
    return { code: 0 }
  }

  async removeMember(id: string, userId: string): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('合作企业不存在')

    const result = await this.prisma.userIdentity.deleteMany({
      where: { type: 'external_enterprise', enterpriseName: profile.name, userId },
    })
    if (result.count === 0) throw new NotFoundException('该成员未绑定该合作企业')

    await this.audit.record({
      module: '合作企业',
      action: '删除关联成员',
      target: `${id} · ${profile.name}`,
      detail: `成员 UID=${userId}`,
    })
    return { code: 0 }
  }

  async stats(id: string): Promise<{ demandCount: number; projectCount: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id } })
    if (!profile) throw new NotFoundException('合作企业不存在')

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
      status: profile.status,
      size: profile.size,
      foundedAt: profile.foundedAt,
      description: profile.description,
      cooperationCount: profile.cooperationCount,
      firstCooperationAt: profile.firstCooperationAt,
      members,
    }
  }
}