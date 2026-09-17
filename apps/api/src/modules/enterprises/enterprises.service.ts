import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Enterprise, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { buildUserDto, type UserDto } from '../users/user.mapper'
import type { QueryEnterprisesDto } from './dto/query-enterprises.dto'
import type { CreateEnterpriseDto } from './dto/create-enterprise.dto'
import type { UpdateEnterpriseDto } from './dto/update-enterprise.dto'

export interface EnterpriseDto {
  id: string
  name: string
  industry: string
  size: string
  foundedAt: string
  settledAt: string | null
  leaseType: string
  status: string
  showcaseStatus: string
  experience: number
  /** 企业等级（按 community_enterprise 等级梯度由经验值推导，列表接口下发） */
  level?: number
  levelName?: string
  /** 关联用户 UID（社区企业必须关联一个个人用户） */
  contactUserId?: string
  /** 联系人职位（展示于成员管理） */
  contactTitle: string
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
    size: e.size,
    foundedAt: e.foundedAt,
    settledAt: e.settledAt,
    leaseType: e.leaseType,
    status: e.status,
    showcaseStatus: e.showcaseStatus,
    experience: e.experience,
    contactTitle: e.contactTitle,
    contactName: e.contactName,
    contactPhone: e.contactPhone,
    description: e.description,
    tags: e.tags,
  }
  if (e.contactEmail != null) dto.contactEmail = e.contactEmail
  if (e.contactUserId != null) dto.contactUserId = e.contactUserId
  return dto
}

/* 社区企业域（wiki-backend.md §7.3）：列表/选项/详情（含派生成员）/数据概览 + 新增/编辑/停用/删除 */
@Injectable()
export class EnterprisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  /* 解析关联用户并返回联系人快照（社区企业必须关联注册用户；联系人姓名取实名优先） */
  private async resolveContactUser(uid: string): Promise<{ contactName: string; contactPhone: string; contactEmail: string | null }> {
    const user = await this.prisma.user.findUnique({ where: { uid } })
    if (!user) throw new BadRequestException('关联用户不存在')
    return {
      contactName: user.realName ?? user.nickname,
      contactPhone: user.phone,
      contactEmail: user.email || null,
    }
  }

  /* 同步关联用户在该企业下的 community_enterprise 身份（联系人即成员）：
   * 已存在则同步职位；不存在则新增（role=member、level=1、experience=0，与审核授予身份口径一致） */
  private async syncContactMember(
    tx: Prisma.TransactionClient,
    enterpriseId: string,
    enterpriseName: string,
    userId: string,
    title: string,
  ): Promise<void> {
    const [existing, enterprise] = await Promise.all([tx.userIdentity.findFirst({
      where: { userId, type: 'community_enterprise', enterpriseId },
    }), tx.enterprise.findUniqueOrThrow({ where: { id: enterpriseId } })])
    const tiers = await tx.levelTier.findMany({ where: { identityType: 'community_enterprise' }, orderBy: { threshold: 'desc' } })
    const level = tiers.find(t => t.threshold <= enterprise.experience)?.level ?? 1
    if (existing) {
      await tx.userIdentity.update({ where: { id: existing.id }, data: { title, enterpriseName, experience: enterprise.experience, level } })
      return
    }
    await tx.userIdentity.create({
      data: {
        userId,
        type: 'community_enterprise',
        enterpriseId,
        enterpriseName,
        role: 'member',
        title,
        level,
        experience: enterprise.experience,
      },
    })
  }

  async create(dto: CreateEnterpriseDto): Promise<{ id: string }> {
    const id = await this.ids.next('E')
    const name = dto.name.trim()
    const contact = await this.resolveContactUser(dto.contactUserId)
    const title = (dto.contactTitle ?? '').trim()
    await this.prisma.$transaction(async (tx) => {
      await tx.enterprise.create({
        data: {
          id,
          name,
          industry: dto.industry.trim(),
          size: dto.size,
          foundedAt: dto.foundedAt ?? '',
          settledAt: dto.settledAt ?? formatToday(),
          leaseType: dto.leaseType,
          status: 'active',
          showcaseStatus: 'none',
          experience: 0,
          contactUserId: dto.contactUserId,
          contactTitle: title,
          contactName: contact.contactName,
          contactPhone: contact.contactPhone,
          contactEmail: contact.contactEmail,
          description: dto.description ?? '',
          tags: dto.tags ?? [],
        },
      })
      /* 联系人即成员：写入社区企业身份，使其出现在详情页「成员管理」 */
      await this.syncContactMember(tx, id, name, dto.contactUserId, title)
    })
    await this.audit.record({
      module: '社区企业',
      action: '新增企业',
      target: `${id} · ${name}`,
    })
    return { id }
  }

  async update(id: string, dto: UpdateEnterpriseDto): Promise<{ code: number }> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id } })
    if (!enterprise) throw new NotFoundException('企业不存在')

    /* 更换关联用户时，联系人姓名/联系电话/邮箱以其为准 */
    const contact = dto.contactUserId !== undefined ? await this.resolveContactUser(dto.contactUserId) : null
    const nextName = dto.name !== undefined ? dto.name.trim() : enterprise.name
    const nextContactUserId = dto.contactUserId !== undefined ? dto.contactUserId : (enterprise.contactUserId ?? null)
    const nextTitle = dto.contactTitle !== undefined ? dto.contactTitle.trim() : enterprise.contactTitle

    await this.prisma.$transaction(async (tx) => {
      await tx.enterprise.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: nextName } : {}),
          ...(dto.industry !== undefined ? { industry: dto.industry.trim() } : {}),
          ...(dto.size !== undefined ? { size: dto.size } : {}),
          ...(dto.leaseType !== undefined ? { leaseType: dto.leaseType } : {}),
          ...(dto.contactUserId !== undefined ? { contactUserId: dto.contactUserId } : {}),
          ...(dto.contactTitle !== undefined ? { contactTitle: dto.contactTitle.trim() } : {}),
          ...(contact
            ? { contactName: contact.contactName, contactPhone: contact.contactPhone, contactEmail: contact.contactEmail }
            : {
                ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
                ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
                ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail || null } : {}),
              }),
          ...(dto.foundedAt !== undefined ? { foundedAt: dto.foundedAt } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        },
      })
      /* 企业改名时同步成员身份的冗余企业名 */
      if (nextName !== enterprise.name) {
        await tx.userIdentity.updateMany({
          where: { type: 'community_enterprise', enterpriseId: id },
          data: { enterpriseName: nextName },
        })
      }
      /* 同步联系人成员身份（新增或职位变更） */
      if (nextContactUserId) {
        await this.syncContactMember(tx, id, nextName, nextContactUserId, nextTitle)
      }
    })
    await this.audit.record({
      module: '社区企业',
      action: '编辑企业',
      target: `${id} · ${enterprise.name}`,
    })
    return { code: 0 }
  }

  async disable(id: string): Promise<{ code: number }> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id } })
    if (!enterprise) throw new NotFoundException('企业不存在')
    await this.prisma.enterprise.update({ where: { id }, data: { status: 'disabled' } })
    await this.audit.record({
      module: '社区企业',
      action: '停用企业',
      target: `${id} · ${enterprise.name}`,
    })
    return { code: 0 }
  }

  async enable(id: string): Promise<{ code: number }> {
    const enterprise = await this.prisma.enterprise.findUnique({ where: { id } })
    if (!enterprise) throw new NotFoundException('企业不存在')
    await this.prisma.enterprise.update({ where: { id }, data: { status: 'active' } })
    await this.audit.record({
      module: '社区企业',
      action: '启用企业',
      target: `${id} · ${enterprise.name}`,
    })
    return { code: 0 }
  }

  async remove(id: string, operator: string): Promise<{ code: number }> {
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id, deletedAt: null } })
    if (!enterprise) throw new NotFoundException('企业不存在')

    /* 业务守卫：存在进行中的租约时不可归档（历史租约不阻断） */
    const activeLeaseCount = await this.prisma.lease.count({
      where: { renterId: id, renterType: 'enterprise', status: 'active', deletedAt: null },
    })
    if (activeLeaseCount > 0) throw new ConflictException('该企业存在关联租约，请先终止租约')

    await this.prisma.enterprise.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })
    await this.audit.record({
      module: '社区企业',
      action: '归档企业',
      target: `${id} · ${enterprise.name}`,
      operator,
    })
    return { code: 0 }
  }

  async list(query: QueryEnterprisesDto): Promise<{ list: EnterpriseDto[]; total: number }> {
    const conditions: Prisma.EnterpriseWhereInput[] = [{ deletedAt: null }]
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

    const [total, rows, tiers] = await Promise.all([
      this.prisma.enterprise.count({ where }),
      this.prisma.enterprise.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.levelTier.findMany({
        where: { identityType: 'community_enterprise' },
        orderBy: { threshold: 'asc' },
      }),
    ])

    const descTiers = [...tiers].reverse()
    return {
      list: rows.map((e) => {
        const tier = descTiers.find((t) => t.threshold <= e.experience)
        return { ...toEnterpriseDto(e), ...(tier ? { level: tier.level, levelName: tier.label } : {}) }
      }),
      total,
    }
  }

  async options(): Promise<Array<{ label: string; value: string }>> {
    const rows = await this.prisma.enterprise.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    return rows.map((e) => ({ label: `${e.name}（${e.id}）`, value: e.id }))
  }

  async detail(id: string): Promise<{ enterprise: EnterpriseDto; members: UserDto[] }> {
    const enterprise = await this.prisma.enterprise.findFirst({ where: { id, deletedAt: null } })
    if (!enterprise) throw new NotFoundException('企业不存在')

    const memberUsers = await this.prisma.user.findMany({
      where: { identities: { some: { type: 'community_enterprise', enterpriseId: id } } },
      include: { identities: { orderBy: { id: 'asc' } } },
      orderBy: { uid: 'asc' },
    })
    const members = await Promise.all(memberUsers.map((u) => buildUserDto(this.prisma, u)))

    return { enterprise: toEnterpriseDto(enterprise), members }
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
