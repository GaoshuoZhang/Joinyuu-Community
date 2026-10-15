import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { ExternalEnterpriseProfile, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow, formatToday } from '../../common/utils/time'
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
  registeredAt: string
  members: ExternalEnterpriseMemberDto[]
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
    /* 关键字/行业/状态筛选与排序、计数、分页全部下发数据库（档案字段即可判定，无需内存后置计算） */
    const where: Prisma.ExternalEnterpriseProfileWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { industry: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.industry) where.industry = query.industry
    if (query.status) where.status = query.status

    const desc = query.sortOrder !== 'ascend'
    const [total, profiles] = await Promise.all([
      this.prisma.externalEnterpriseProfile.count({ where }),
      this.prisma.externalEnterpriseProfile.findMany({
        where,
        orderBy: { registeredAt: desc ? 'desc' : 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    /* 当页成员一次性批量取回（原实现每个档案单独查 userIdentity，N+1） */
    const membersByProfile = await this.membersByProfileNames(profiles.map((profile) => profile.name))
    return {
      list: profiles.map((profile) => this.toDto(profile, membersByProfile.get(profile.name) ?? [])),
      total,
    }
  }

  async detail(id: string): Promise<ExternalEnterpriseDto> {
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({
      where: { id, deletedAt: null },
    })
    if (!profile) throw new NotFoundException('合作企业不存在')
    return this.aggregate(profile)
  }

  async create(dto: CreateExternalEnterpriseDto): Promise<{ id: string }> {
    const existing = await this.prisma.externalEnterpriseProfile.findFirst({ where: { name: dto.name.trim(), deletedAt: null } })
    if (existing) throw new ConflictException('已存在同名合作企业档案，请编辑已有档案')
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
        registeredAt: formatToday(),
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
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({
      where: { id, deletedAt: null },
    })
    if (!profile) throw new NotFoundException('合作企业不存在')

    /* 改名时同步迁移已有成员身份（成员以档案名匹配）；迁移与改名同事务，避免中途失败导致名称不一致 */
    const name = dto.name?.trim() ?? profile.name
    if (name !== profile.name) {
      /* 改名撞同名未删除档案会静默合并成员身份，前置拦截 */
      const sameName = await this.prisma.externalEnterpriseProfile.findFirst({
        where: { id: { not: id }, deletedAt: null, name },
      })
      if (sameName) throw new ConflictException('已存在同名合作企业档案')
    }

    await this.prisma.$transaction(async (tx) => {
      if (name !== profile.name) {
        await tx.userIdentity.updateMany({
          where: { type: 'external_enterprise', enterpriseName: profile.name },
          data: { enterpriseName: name },
        })
      }
      await tx.externalEnterpriseProfile.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name } : {}),
          ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
          ...(dto.size !== undefined ? { size: dto.size } : {}),
          ...(dto.foundedAt !== undefined ? { foundedAt: dto.foundedAt } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
      })
    })
    await this.audit.record({
      module: '合作企业',
      action: '编辑合作企业',
      target: `${id} · ${profile.name}`,
    })
    return { code: 0 }
  }

  async disable(id: string): Promise<{ code: number }> {
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({ where: { id, deletedAt: null } })
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
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({ where: { id, deletedAt: null } })
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
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({ where: { id, deletedAt: null } })
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
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({ where: { id, deletedAt: null } })
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
    const profile = await this.prisma.externalEnterpriseProfile.findFirst({ where: { id, deletedAt: null } })
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

  /** 单档案聚合视图（详情用）：成员按档案名批量取回后再取本档案一份 */
  private async aggregate(profile: ExternalEnterpriseProfile): Promise<ExternalEnterpriseDto> {
    const membersByProfile = await this.membersByProfileNames([profile.name])
    return this.toDto(profile, membersByProfile.get(profile.name) ?? [])
  }

  /** 按档案名批量取成员并分组（一次查询覆盖多个档案，替代逐档案查询）；组内顺序与原 per-档案 查询一致 */
  private async membersByProfileNames(names: string[]): Promise<Map<string, ExternalEnterpriseMemberDto[]>> {
    const grouped = new Map<string, ExternalEnterpriseMemberDto[]>()
    if (!names.length) return grouped

    const identities = await this.prisma.userIdentity.findMany({
      where: { type: 'external_enterprise', enterpriseName: { in: names } },
      include: { user: true },
      orderBy: [{ userId: 'asc' }, { id: 'asc' }],
    })
    for (const i of identities) {
      if (i.enterpriseName == null) continue
      const members = grouped.get(i.enterpriseName) ?? []
      members.push({
        userId: i.userId,
        name: i.user.realName ?? i.user.nickname,
        title: i.title,
        phone: i.user.phone ?? '',
        status: i.user.status,
      })
      grouped.set(i.enterpriseName, members)
    }
    return grouped
  }

  private toDto(profile: ExternalEnterpriseProfile, members: ExternalEnterpriseMemberDto[]): ExternalEnterpriseDto {
    return {
      id: profile.id,
      name: profile.name,
      industry: profile.industry,
      status: profile.status,
      size: profile.size,
      foundedAt: profile.foundedAt,
      description: profile.description,
      registeredAt: profile.registeredAt,
      members,
    }
  }
}
