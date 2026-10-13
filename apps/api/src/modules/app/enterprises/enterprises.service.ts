import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  Prisma,
  type Enterprise,
  type EnterpriseInvitation,
  type TransferRequest,
  type User,
  type UserIdentity,
} from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { formatNow } from '../../../common/utils/time'
import { AuditService } from '../../../common/audit/audit.service'
import { FULL_PRICE_DISCOUNT, resolveEnterprisePointsDiscount, resolveUserPointsDiscount } from '../../../common/points/points-discount'
import {
  assertEnterprisePermission,
  ENTERPRISE_PERMISSIONS,
  type EnterprisePermission,
} from '../../../common/enterprise/enterprise-permission'
import type {
  IndividualEducationSegment,
  IndividualHonorSegment,
  IndividualLinkSegment,
  IndividualProjectSegment,
  IndividualWorkSegment,
  UpdateIndividualCardDto,
} from './dto/individual-card.dto'
import type {
  ExitApplicationDto,
  InviteMemberDto,
  RemoveMemberDto,
  RespondActionDto,
  TransferContactDto,
  UpdateEnterpriseDto,
  UpdateMemberDto,
} from './dto/enterprise.dto'
import { ENTERPRISE_CARD_FIELDS, INDIVIDUAL_CARD_FIELDS } from './dto/card-schema.dto'

/** 企业成员 8 项权限（负责人隐式全量，成员按 UserIdentity.permissions 判定） */
export { ENTERPRISE_PERMISSIONS, type EnterprisePermission } from '../../../common/enterprise/enterprise-permission'

/** 邀请 / 负责人转移有效期（天） */
const REQUEST_TTL_DAYS = 7

export interface MyIndividualCardDto {
  displayName: string
  avatar?: string
  age?: string
  politicalStatus?: string
  intro: string
  industryExperience?: string
  skills: string[]
  education: IndividualEducationSegment[]
  work: IndividualWorkSegment[]
  projects: IndividualProjectSegment[]
  honors: IndividualHonorSegment[]
  socials: IndividualLinkSegment[]
  customLinks: IndividualLinkSegment[]
  level?: number
  levelName?: string
  visibility?: { age: boolean; politicalStatus: boolean; isPublic: boolean }
}

export interface MyEnterpriseCardDto {
  enterpriseId: string
  enterpriseName: string
  industry: string
  size: string
  description: string
  isContact: boolean
  contactName?: string
}

export interface MyCardsDto {
  individual?: MyIndividualCardDto
  enterprise?: MyEnterpriseCardDto
}

export interface MyIdentitySummaryDto {
  key: string
  type: string
  label: string
  name: string
  subtitle?: string
  roleLabel?: string
  isContact?: boolean
  permissions?: string[]
  enterpriseId?: string
  /** 该身份消费积分时的等级折扣（1 = 1 折 … 10 = 原价；个人身份取本人社区个体等级、企业身份取企业等级） */
  pointsDiscount: number
}

export interface EnterpriseMemberDto {
  uid: string
  name: string
  role?: string
  phone?: string
  permissions?: string[]
  isContact?: boolean
}

export interface EnterpriseInvitationDto {
  id: string
  enterpriseId: string
  enterpriseName: string
  memberName: string
  phone: string
  role: string
  inviterName: string
  status: string
  at: string
  respondedAt?: string
  expiresAt?: string
}

export interface EnterpriseTransferRequestDto {
  id: string
  enterpriseId: string
  enterpriseName: string
  fromUid: string
  fromName: string
  toUid: string
  toName: string
  status: string
  at: string
  respondedAt?: string
  expiresAt?: string
}

export interface EnterpriseExitApplicationDto {
  status: 'pending' | 'approved' | 'rejected'
  reason?: string
  at: string
}

export interface MyEnterpriseDetailDto {
  enterpriseId: string
  enterpriseName: string
  logo?: string
  industry: string
  size: string
  foundedAt?: string
  website?: string
  address?: string
  services?: string
  advantages?: string
  description: string
  contactUid?: string
  contactName?: string
  members: EnterpriseMemberDto[]
  isContact: boolean
  myPermissions: string[]
  invitations: EnterpriseInvitationDto[]
  transferRequest?: EnterpriseTransferRequestDto | null
  exitApplication?: EnterpriseExitApplicationDto | null
}

export interface InvitationDetailDto extends EnterpriseInvitationDto {
  enterpriseLogo?: string
  enterpriseIndustry: string
  enterpriseSize: string
}

export interface EnterpriseShowcaseDto {
  id: string
  name: string
  logo?: string
  industry: string
  size: string
  foundedAt?: string
  website?: string
  address?: string
  services?: string
  advantages?: string
  description: string
  members: string[]
}

/* 企业治理（M2-R R3 /api/app/**）：名片/身份、企业详情与成员管理、邀请、负责人转移（请求制）、
 * 退驻、公开企业名片与工作台（工作台统一由 engagement 模块 /me/enterprise-workbench 提供）。
 * 权限模型：contactUserId=负责人隐式全量；成员按 UserIdentity.permissions；
 * 非成员访问管理端点统一 404「企业不存在或你不是成员」，无权限 403「你没有该操作权限」。 */
@Injectable()
export class AppEnterprisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly audit: AuditService,
  ) {}

  async cardSchema(type: string) {
    const allowed = this.cardFields(type)
    const config = await this.prisma.cardFieldConfig.findUnique({ where: { type } })
    return { type, editableFields: config?.editableFields ?? [...allowed] }
  }

  async saveCardSchema(type: string, fields: string[], operator: string): Promise<{ code: number }> {
    const allowed = this.cardFields(type)
    const editableFields = [...new Set(fields)]
    if (editableFields.some(field => !allowed.includes(field))) {
      throw new BadRequestException('名片字段配置不合法')
    }
    await this.prisma.cardFieldConfig.upsert({
      where: { type },
      create: { type, editableFields, updatedAt: formatNow(), updatedBy: operator },
      update: { editableFields, updatedAt: formatNow(), updatedBy: operator },
    })
    await this.audit.record({ module: '名片管理', action: '配置可编辑字段', target: type, detail: editableFields.join('、'), operator })
    return { code: 0 }
  }

  async adminCards(type: string, page: number, pageSize: number, keyword?: string) {
    this.cardFields(type)
    const kw = keyword?.trim()
    if (type === 'individual') {
      const where: Prisma.IndividualCardWhereInput = kw ? { OR: [
        { displayName: { contains: kw, mode: 'insensitive' } },
        { user: { OR: [
        { uid: { contains: kw, mode: 'insensitive' } },
        { nickname: { contains: kw, mode: 'insensitive' } },
        { realName: { contains: kw, mode: 'insensitive' } },
      ] } },
      ] } : {}
      const [total, rows] = await Promise.all([
        this.prisma.individualCard.count({ where }),
        this.prisma.individualCard.findMany({ where, include: { user: { select: { nickname: true, realName: true, avatar: true } } }, orderBy: { userId: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      ])
      return { list: rows.map(row => ({ ...row, displayName: row.displayName || row.user.realName || row.user.nickname })), total }
    }
    const where: Prisma.EnterpriseWhereInput = { deletedAt: null, ...(kw ? { OR: [
      { id: { contains: kw, mode: 'insensitive' } }, { name: { contains: kw, mode: 'insensitive' } },
    ] } : {}) }
    const [total, list] = await Promise.all([
      this.prisma.enterprise.count({ where }),
      this.prisma.enterprise.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
    return { list, total }
  }

  async adminCard(type: string, id: string) {
    this.cardFields(type)
    if (type === 'enterprise') {
      const enterprise = await this.prisma.enterprise.findFirst({ where: { id, deletedAt: null } })
      if (!enterprise) throw new NotFoundException('企业不存在')
      return enterprise
    }
    const user = await this.prisma.user.findUnique({
      where: { uid: id },
      include: { identities: { where: { type: 'community_individual' }, take: 1 }, individualCard: true },
    })
    if (!user || user.identities.length === 0) throw new NotFoundException('个人名片不存在')
    const card = user.individualCard
    return {
      userId: user.uid,
      displayName: card?.displayName || user.realName || user.nickname,
      intro: card?.intro ?? user.bio ?? '',
      industryExperience: card?.industryExperience ?? '',
      skills: card?.skills ?? [],
      age: card?.age ?? null,
      politicalStatus: card?.politicalStatus ?? null,
      education: card?.education ?? [], work: card?.work ?? [], projects: card?.projects ?? [],
      honors: card?.honors ?? [], socials: card?.socials ?? [], customLinks: card?.customLinks ?? [],
      visibility: card?.visibility ?? { age: true, politicalStatus: true, isPublic: true },
    }
  }

  /** 我的名片：社区个体 → 个人名片；社区企业 → 企业名片入口（都没有则省略对应键） */
  async myCards(uid: string): Promise<MyCardsDto> {
    const user = await this.requireUser(uid)
    const result: MyCardsDto = {}

    const individual = user.identities.find((i) => i.type === 'community_individual')
    if (individual) {
      const [card, tier] = await Promise.all([
        this.prisma.individualCard.findUnique({ where: { userId: uid } }),
        individual.level != null
          ? this.prisma.levelTier.findUnique({ where: { identityType_level: { identityType: 'community_individual', level: individual.level } } })
          : Promise.resolve(null),
      ])
      const visibility = (card?.visibility ?? null) as unknown as { age?: boolean; politicalStatus?: boolean; isPublic?: boolean } | null
      result.individual = {
        displayName: card?.displayName || user.realName || user.nickname,
        ...(user.avatar ? { avatar: user.avatar } : {}),
        ...(card?.age != null ? { age: String(card.age) } : {}),
        ...(card?.politicalStatus ? { politicalStatus: card.politicalStatus } : {}),
        intro: card?.intro ?? user.bio ?? '',
        ...(card?.industryExperience ? { industryExperience: card.industryExperience } : {}),
        skills: (card?.skills ?? []) as unknown as string[],
        education: (card?.education ?? []) as unknown as IndividualEducationSegment[],
        work: (card?.work ?? []) as unknown as IndividualWorkSegment[],
        projects: (card?.projects ?? []) as unknown as IndividualProjectSegment[],
        honors: (card?.honors ?? []) as unknown as IndividualHonorSegment[],
        socials: (card?.socials ?? []) as unknown as IndividualLinkSegment[],
        customLinks: (card?.customLinks ?? []) as unknown as IndividualLinkSegment[],
        ...(individual.level != null ? { level: individual.level } : {}),
        ...(tier?.label ? { levelName: tier.label } : {}),
        ...(visibility ? { visibility: { age: visibility.age ?? true, politicalStatus: visibility.politicalStatus ?? true, isPublic: visibility.isPublic ?? true } } : {}),
      }
    }

    const entIdentity = user.identities.find((i) => i.type === 'community_enterprise' && i.enterpriseId)
    if (entIdentity?.enterpriseId) {
      const ent = await this.prisma.enterprise.findUnique({ where: { id: entIdentity.enterpriseId } })
      if (ent && !ent.deletedAt) {
        result.enterprise = {
          enterpriseId: ent.id,
          enterpriseName: ent.name,
          industry: ent.industry,
          size: ent.size,
          description: ent.description,
          isContact: ent.contactUserId === uid,
          contactName: ent.contactName,
        }
      }
    }
    return result
  }

  /** 保存个人名片（需社区个体身份；免审保存即公开） */
  async updateIndividualCard(uid: string, dto: UpdateIndividualCardDto): Promise<{ code: number }> {
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId: uid, type: 'community_individual' },
      select: { id: true },
    })
    if (!identity) throw new ForbiddenException('当前账号没有社区个体身份')
    await this.assertEditableFields('individual', dto)

    await this.saveIndividualCard(uid, dto)
    return { code: 0 }
  }

  async adminUpdateIndividualCard(uid: string, dto: UpdateIndividualCardDto, operator: string): Promise<{ code: number }> {
    const user = await this.prisma.user.findUnique({ where: { uid }, select: { nickname: true, identities: true } })
    if (!user || !user.identities.some(identity => identity.type === 'community_individual')) throw new NotFoundException('个人名片不存在')
    await this.saveIndividualCard(uid, dto)
    await this.audit.record({ module: '名片管理', action: '编辑个人名片', target: `${uid} · ${user.nickname}`, operator })
    await this.notify.pushNotice(uid, { type: 'system', title: '个人名片已更新', content: '社区工作人员已更新您的个人名片。', link: '/me/cards/individual' })
    return { code: 0 }
  }

  private async saveIndividualCard(uid: string, dto: UpdateIndividualCardDto) {
    await this.prisma.$transaction(async tx => {
      // Lock the parent even before a card exists; app/admin partial writes serialize together.
      await tx.$queryRaw`SELECT uid FROM "User" WHERE uid = ${uid} FOR UPDATE`
      const current = await tx.individualCard.findUnique({ where: { userId: uid } })
      const data = this.individualCardData(dto)
      if (dto.visibility !== undefined) {
        const previous = (current?.visibility ?? {}) as { age?: boolean; politicalStatus?: boolean; isPublic?: boolean }
        data.visibility = {
          age: dto.visibility.age ?? previous.age ?? true,
          politicalStatus: dto.visibility.politicalStatus ?? previous.politicalStatus ?? true,
          isPublic: dto.visibility.isPublic ?? previous.isPublic ?? true,
        }
      }
      await tx.individualCard.upsert({ where: { userId: uid }, create: { userId: uid, ...data }, update: data })
    })
  }

  private individualCardData(dto: UpdateIndividualCardDto): Omit<Prisma.IndividualCardUncheckedCreateInput, 'userId'> {
    const data: Omit<Prisma.IndividualCardUncheckedCreateInput, 'userId'> = { updatedAt: formatNow() }
    if (dto.displayName !== undefined) data.displayName = dto.displayName.trim() || null
    if (dto.intro !== undefined) data.intro = dto.intro.trim()
    if (dto.industryExperience !== undefined) data.industryExperience = dto.industryExperience.trim() || null
    if (dto.skills !== undefined) data.skills = dto.skills.map((s) => s.trim()).filter(Boolean)
    if (dto.age !== undefined) {
      const parsedAge = dto.age.trim() ? Number(dto.age) : null
      if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 150)) throw new BadRequestException('年龄应为 0-150 的整数')
      data.age = parsedAge
    }
    if (dto.politicalStatus !== undefined) data.politicalStatus = dto.politicalStatus.trim() || null
    if (dto.education !== undefined) data.education = dto.education as unknown as Prisma.InputJsonValue
    if (dto.work !== undefined) data.work = dto.work as unknown as Prisma.InputJsonValue
    if (dto.projects !== undefined) data.projects = dto.projects as unknown as Prisma.InputJsonValue
    if (dto.honors !== undefined) data.honors = dto.honors as unknown as Prisma.InputJsonValue
    if (dto.socials !== undefined) data.socials = dto.socials as unknown as Prisma.InputJsonValue
    if (dto.customLinks !== undefined) data.customLinks = dto.customLinks as unknown as Prisma.InputJsonValue
    for (const link of [...(dto.socials ?? []), ...(dto.customLinks ?? [])]) {
      if (!link || typeof link.url !== 'string' || (link.url && !/^https?:\/\//i.test(link.url))) throw new BadRequestException('名片链接需以 http(s):// 开头')
    }
    return data
  }

  /** 我的关联身份：社区个体 + 各社区企业 + 合作企业（无企业记录的合作企业组织展示为信息卡） */
  async myIdentities(uid: string): Promise<MyIdentitySummaryDto[]> {
    const user = await this.requireUser(uid)
    const list: MyIdentitySummaryDto[] = []

    const individual = user.identities.find((i) => i.type === 'community_individual')
    if (individual) {
      list.push({
        key: 'community_individual',
        type: 'community_individual',
        label: '社区个体',
        name: user.nickname,
        subtitle: '',
        pointsDiscount: await resolveUserPointsDiscount(this.prisma, uid),
      })
    }

    const entIds = user.identities
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId)
      .map((i) => i.enterpriseId as string)
    if (entIds.length) {
      const ents = await this.prisma.enterprise.findMany({ where: { id: { in: entIds }, deletedAt: null } })
      const byId = new Map(ents.map((e) => [e.id, e]))
      for (const identity of user.identities) {
        if (identity.type !== 'community_enterprise' || !identity.enterpriseId) continue
        const ent = byId.get(identity.enterpriseId)
        if (!ent) continue
        const isContact = ent.contactUserId === uid
        list.push({
          key: ent.id,
          type: 'community_enterprise',
          label: '社区企业',
          name: ent.name,
          subtitle: `${ent.industry} · ${ent.size}`,
          roleLabel: identity.title,
          isContact,
          permissions: isContact ? [...ENTERPRISE_PERMISSIONS] : identity.permissions,
          enterpriseId: ent.id,
          pointsDiscount: await resolveEnterprisePointsDiscount(this.prisma, ent.id),
        })
      }
    }

    for (const identity of user.identities) {
      if (identity.type !== 'external_enterprise' || !identity.enterpriseName?.trim()) continue
      const name = identity.enterpriseName.trim()
      if (list.some((x) => x.name === name)) continue
      list.push({
        key: `external:${name}`,
        type: 'external_enterprise',
        label: '合作企业',
        name,
        subtitle: identity.title,
        /* 合作企业无等级体系：消费积分按原价 */
        pointsDiscount: FULL_PRICE_DISCOUNT,
      })
    }
    return list
  }

  /** 企业详情（成员/负责人可查看；pending 邀请与转移惰性过期） */
  async enterpriseDetail(uid: string, id: string): Promise<MyEnterpriseDetailDto> {
    await this.expirePendingInvitations()
    await this.expirePendingTransfers()
    const { ent, identity } = await this.requireMemberEnterprise(uid, id)

    const identityRows = await this.prisma.userIdentity.findMany({
      where: { type: 'community_enterprise', enterpriseId: ent.id },
      include: { user: { select: { nickname: true } } },
      orderBy: { id: 'asc' },
    })
    const invitationRows = await this.prisma.enterpriseInvitation.findMany({
      where: { enterpriseId: ent.id },
      orderBy: { createdAt: 'desc' },
    })
    const inviterNames = await this.nicknamesOf(invitationRows.map((r) => r.inviterId))
    const pendingTransfer = await this.prisma.transferRequest.findFirst({
      where: { enterpriseId: ent.id, status: 'pending', OR: [{ fromUserId: uid }, { toUserId: uid }] },
      orderBy: { createdAt: 'desc' },
    })
    const transferNames = pendingTransfer
      ? await this.nicknamesOf([pendingTransfer.fromUserId, pendingTransfer.toUserId])
      : new Map<string, string>()
    const exitApp = await this.prisma.application.findFirst({
      where: { type: 'exit', targetName: ent.name, deletedAt: null },
      orderBy: { submittedAt: 'desc' },
    })

    const isContact = ent.contactUserId === uid
    /* 成员手机号与邀请记录（含被邀请人手机号）属管理信息：仅负责人与持相应权限的成员可见 */
    const canManageMembers = isContact || (await this.hasPermission(uid, ent.id, 'manage_members'))
    const canInviteMember = isContact || (await this.hasPermission(uid, ent.id, 'invite_member'))
    const servicesText = this.toText(ent.services)
    const advantagesText = this.toText(ent.advantages)
    const exitReason = exitApp ? this.exitReason(exitApp.details) : undefined

    return {
      enterpriseId: ent.id,
      enterpriseName: ent.name,
      ...(ent.logo ? { logo: ent.logo } : {}),
      industry: ent.industry,
      size: ent.size,
      ...(ent.foundedAt ? { foundedAt: ent.foundedAt } : {}),
      ...(ent.website ? { website: ent.website } : {}),
      ...(ent.address ? { address: ent.address } : {}),
      ...(servicesText ? { services: servicesText } : {}),
      ...(advantagesText ? { advantages: advantagesText } : {}),
      description: ent.description,
      ...(ent.contactUserId ? { contactUid: ent.contactUserId } : {}),
      contactName: ent.contactName,
      members: identityRows.map((row) => ({
        uid: row.userId,
        name: row.user.nickname,
        role: row.title,
        ...(canManageMembers && row.memberPhone ? { phone: row.memberPhone } : {}),
        permissions: row.userId === ent.contactUserId ? [...ENTERPRISE_PERMISSIONS] : row.permissions,
        isContact: row.userId === ent.contactUserId,
      })),
      isContact,
      myPermissions: isContact ? [...ENTERPRISE_PERMISSIONS] : identity?.permissions ?? [],
      invitations: canInviteMember
        ? [...invitationRows]
            .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))
            .map((r) => this.invitationShape(r, ent.name, inviterNames))
        : [],
      transferRequest: pendingTransfer ? this.transferShape(pendingTransfer, ent.name, transferNames) : null,
      exitApplication: exitApp
        ? {
            status: exitApp.status as EnterpriseExitApplicationDto['status'],
            ...(exitReason ? { reason: exitReason } : {}),
            at: exitApp.submittedAt,
          }
        : null,
    }
  }

  /** 修改企业名片（需 edit_card 权限） */
  async updateEnterprise(uid: string, id: string, dto: UpdateEnterpriseDto): Promise<{ code: number }> {
    const { ent } = await this.requireMemberEnterprise(uid, id)
    if (!(await this.hasPermission(uid, ent.id, 'edit_card'))) throw new ForbiddenException('你没有该操作权限')
    await this.assertEditableFields('enterprise', dto)

    const data = this.enterpriseCardData(dto)
    await this.prisma.enterprise.update({ where: { id: ent.id }, data })
    return { code: 0 }
  }

  async adminUpdateEnterpriseCard(id: string, dto: UpdateEnterpriseDto, operator: string): Promise<{ code: number }> {
    const ent = await this.prisma.enterprise.findFirst({ where: { id, deletedAt: null } })
    if (!ent) throw new NotFoundException('企业不存在')
    await this.prisma.enterprise.update({ where: { id }, data: this.enterpriseCardData(dto) })
    await this.audit.record({ module: '名片管理', action: '编辑企业名片', target: `${id} · ${ent.name}`, operator })
    if (ent.contactUserId) await this.notify.pushNotice(ent.contactUserId, { type: 'system', title: '企业名片已更新', content: `社区工作人员已更新「${ent.name}」的企业名片。`, link: `/me/enterprises/${id}` })
    return { code: 0 }
  }

  private enterpriseCardData(dto: UpdateEnterpriseDto): Prisma.EnterpriseUpdateInput {
    const data: Prisma.EnterpriseUpdateInput = {}
    if (dto.industry !== undefined) data.industry = dto.industry.trim()
    if (dto.size !== undefined) data.size = dto.size.trim()
    if (dto.description !== undefined) data.description = dto.description.trim()
    if (dto.logo !== undefined) data.logo = dto.logo.trim() || null
    if (dto.foundedAt !== undefined) data.foundedAt = dto.foundedAt.trim()
    if (dto.website !== undefined) {
      if (dto.website.trim() && !/^https?:\/\//i.test(dto.website.trim())) throw new BadRequestException('官网需以 http(s):// 开头')
      data.website = dto.website.trim() || null
    }
    if (dto.address !== undefined) data.address = dto.address.trim() || null
    if (dto.services !== undefined) data.services = this.toArray(dto.services)
    if (dto.advantages !== undefined) data.advantages = this.toArray(dto.advantages)
    return data
  }

  private cardFields(type: string): readonly string[] {
    if (type === 'individual') return INDIVIDUAL_CARD_FIELDS
    if (type === 'enterprise') return ENTERPRISE_CARD_FIELDS
    throw new BadRequestException('名片类型不合法')
  }

  private async assertEditableFields(type: string, dto: object): Promise<void> {
    const schema = await this.cardSchema(type)
    const blocked = Object.entries(dto).filter(([key, value]) => value !== undefined && !schema.editableFields.includes(key)).map(([key]) => key)
    if (blocked.length) throw new ForbiddenException(`以下名片字段暂不可编辑：${blocked.join('、')}`)
  }

  /** 邀请企业成员（需 invite_member 权限；EI 记录 7 天有效并通知被邀请人） */
  async inviteMember(uid: string, id: string, dto: InviteMemberDto): Promise<{ code: number }> {
    await this.expirePendingInvitations()
    const { ent } = await this.requireMemberEnterprise(uid, id)
    if (!(await this.hasPermission(uid, ent.id, 'invite_member'))) throw new ForbiddenException('你没有该操作权限')

    const me = await this.requireUser(uid)
    const name = dto.name.trim()
    const phone = dto.phone.trim()
    const role = dto.role.trim()
    if (!name) throw new BadRequestException('请输入成员姓名')
    if (!/^1\d{10}$/.test(phone)) throw new BadRequestException('请输入正确的手机号')
    if (!role) throw new BadRequestException('请输入成员职位')
    if (me.phone === phone) throw new ConflictException('不能邀请自己')

    const invitee = await this.prisma.user.findFirst({ where: { phone } })
    if (!invitee) throw new BadRequestException('该手机号尚未注册聚屿账号')

    const memberIdentity = await this.prisma.userIdentity.findFirst({
      where: { userId: invitee.uid, type: 'community_enterprise', enterpriseId: ent.id },
      select: { id: true },
    })
    if (memberIdentity) throw new ConflictException('该用户已是企业成员')

    const dup = await this.prisma.enterpriseInvitation.findFirst({
      where: { enterpriseId: ent.id, phone, status: 'pending' },
      select: { id: true },
    })
    if (dup) throw new ConflictException('已存在待处理的邀请')

    const invitationId = await this.ids.next('EI')
    try {
      await this.prisma.enterpriseInvitation.create({
        data: {
          id: invitationId,
          enterpriseId: ent.id,
          inviterId: uid,
          inviteeUid: invitee.uid,
          memberName: name,
          phone,
          role,
          status: 'pending',
          createdAt: formatNow(),
          expiresAt: this.expiresAfter(REQUEST_TTL_DAYS),
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('已存在待处理的邀请')
      }
      throw error
    }
    await this.notify.pushNotice(invitee.uid, {
      type: 'invite',
      title: '您收到一条企业成员邀请',
      content: `${ent.name} 邀请您加入（${role}），7 天内有效`,
      link: `/me/invitations/${invitationId}`,
    })
    return { code: 0 }
  }

  /** 修改成员信息：职位写 identity.title、手机号写 memberPhone（manage_members）；权限写 permissions（assign_permission） */
  async updateMember(uid: string, id: string, dto: UpdateMemberDto): Promise<{ code: number }> {
    const { ent } = await this.requireMemberEnterprise(uid, id)
    const wantsBase = dto.role !== undefined || dto.phone !== undefined
    const wantsPerm = dto.permissions !== undefined
    if (!wantsBase && !wantsPerm) throw new BadRequestException('没有需要保存的修改')
    if (wantsBase && !(await this.hasPermission(uid, ent.id, 'manage_members'))) throw new ForbiddenException('你没有该操作权限')
    if (wantsPerm && !(await this.hasPermission(uid, ent.id, 'assign_permission'))) throw new ForbiddenException('你没有该操作权限')

    const target = await this.locateMember(ent.id, dto.memberUid)
    if (wantsPerm) {
      if (target.userId === ent.contactUserId) throw new ConflictException('负责人无需分配权限')
      /* 防自我提权：不得给自己写权限位（持 assign_permission 的成员据此后可自授 manage_members 等全权） */
      if (target.userId === uid) throw new ForbiddenException('不可修改自己的成员权限')
    }

    const data: Prisma.UserIdentityUpdateInput = {}
    if (dto.role !== undefined) {
      const role = dto.role.trim()
      if (!role) throw new BadRequestException('请输入成员职位')
      data.title = role
    }
    if (dto.phone !== undefined) data.memberPhone = dto.phone.trim() || null
    if (dto.permissions !== undefined) {
      const invalid = dto.permissions.filter((p) => !(ENTERPRISE_PERMISSIONS as readonly string[]).includes(p))
      if (invalid.length) throw new BadRequestException('权限取值不合法')
      data.permissions = [...new Set(dto.permissions)]
    }
    await this.prisma.userIdentity.update({ where: { id: target.id }, data })
    return { code: 0 }
  }

  /** 移除企业成员（需 manage_members；负责人需先完成转移） */
  async removeMember(uid: string, id: string, dto: RemoveMemberDto): Promise<{ code: number }> {
    const { ent } = await this.requireMemberEnterprise(uid, id)
    if (!(await this.hasPermission(uid, ent.id, 'manage_members'))) throw new ForbiddenException('你没有该操作权限')
    const target = await this.locateMember(ent.id, dto.memberUid)
    if (target.userId === ent.contactUserId) throw new ConflictException('负责人需先完成转移后才能移除')

    await this.prisma.userIdentity.delete({ where: { id: target.id } })
    await this.notify.pushNotice(target.userId, {
      type: 'system',
      title: '您已被移出企业',
      content: `您已被移出「${ent.name}」的企业成员。`,
    })
    return { code: 0 }
  }

  /** 发起负责人转移（仅负责人；目标为成员；同企业同时仅一条 pending） */
  async transferContact(uid: string, id: string, dto: TransferContactDto): Promise<{ code: number }> {
    await this.expirePendingTransfers()
    const { ent } = await this.requireMemberEnterprise(uid, id)
    if (ent.contactUserId !== uid) throw new ForbiddenException('只有负责人可以发起转移')

    const target = await this.locateMember(ent.id, dto.memberUid)
    if (target.userId === uid) throw new ConflictException('不能转移给自己')
    const pending = await this.prisma.transferRequest.findFirst({
      where: { enterpriseId: ent.id, status: 'pending' },
      select: { id: true },
    })
    if (pending) throw new ConflictException('已存在待处理的转移请求')

    const requestId = await this.ids.next('TR')
    try {
      await this.prisma.transferRequest.create({
        data: {
          id: requestId,
          enterpriseId: ent.id,
          fromUserId: uid,
          toUserId: target.userId,
          status: 'pending',
          createdAt: formatNow(),
          expiresAt: this.expiresAfter(REQUEST_TTL_DAYS),
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('已存在待处理的转移请求')
      }
      throw error
    }
    await this.notify.pushNotice(target.userId, {
      type: 'transfer',
      title: '您收到一条负责人转移请求',
      content: `「${ent.name}」请求将企业负责人转移给您，7 天内有效。`,
      link: '/me/transfer-requests',
    })
    return { code: 0 }
  }

  /** 我收到的待确认负责人转移请求（仅 pending，按创建倒序；已处理/已过期的不再下发，避免误点报错） */
  async myTransferRequests(uid: string): Promise<EnterpriseTransferRequestDto[]> {
    await this.expirePendingTransfers()
    const rows = await this.prisma.transferRequest.findMany({
      where: { toUserId: uid, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })
    if (!rows.length) return []
    const entNames = await this.enterpriseNamesOf(rows.map((r) => r.enterpriseId))
    const names = await this.nicknamesOf([...rows.map((r) => r.fromUserId), uid])
    return rows.map((r) => this.transferShape(r, entNames.get(r.enterpriseId) ?? '', names))
  }

  /** 接受/拒绝负责人转移（仅被转移人；accept 单事务变更 contactUserId 与双方身份） */
  async respondTransfer(uid: string, requestId: string, dto: RespondActionDto): Promise<{ code: number }> {
    await this.expirePendingTransfers()
    const request = await this.prisma.transferRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('转移请求不存在')
    if (request.toUserId !== uid) throw new ForbiddenException('仅被转移人可以处理该请求')
    if (request.status !== 'pending') throw new ConflictException('该请求已处理或已过期')

    const ent = await this.prisma.enterprise.findUnique({ where: { id: request.enterpriseId } })
    if (!ent) throw new NotFoundException('企业不存在')
    const me = await this.requireUser(uid)
    const myIdentity = await this.prisma.userIdentity.findFirst({
      where: { userId: uid, type: 'community_enterprise', enterpriseId: ent.id },
    })
    if (!myIdentity) throw new NotFoundException('企业不存在或你不是成员')

    if (dto.action === 'accept') {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.transferRequest.updateMany({
          where: { id: request.id, status: 'pending' },
          data: { status: 'accepted', respondedAt: formatNow() },
        })
        if (claimed.count !== 1) throw new ConflictException('该请求已处理或已过期')
        await tx.enterprise.update({
          where: { id: ent.id },
          data: {
            contactUserId: uid,
            contactTitle: myIdentity.title,
            contactName: me.nickname,
            contactPhone: me.phone ?? '',
          },
        })
        await tx.userIdentity.update({ where: { id: myIdentity.id }, data: { role: 'founder' } })
        const fromIdentity = await tx.userIdentity.findFirst({
          where: { userId: request.fromUserId, type: 'community_enterprise', enterpriseId: ent.id },
        })
        if (fromIdentity) {
          await tx.userIdentity.update({ where: { id: fromIdentity.id }, data: { role: 'member' } })
        }
      })
      await this.notify.pushNotice(request.fromUserId, {
        type: 'transfer',
        title: '负责人转移已完成',
        content: `${me.nickname} 已接受，「${ent.name}」企业负责人已变更。`,
        link: `/me/enterprises/${ent.id}`,
      })
      return { code: 0 }
    }

    const claimed = await this.prisma.transferRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: 'rejected', respondedAt: formatNow() },
    })
    if (claimed.count !== 1) throw new ConflictException('该请求已处理或已过期')
    await this.notify.pushNotice(request.fromUserId, {
      type: 'transfer',
      title: '负责人转移被拒绝',
      content: `${me.nickname} 拒绝了「${ent.name}」的负责人转移请求。`,
      link: `/me/enterprises/${ent.id}`,
    })
    return { code: 0 }
  }

  /** 发起方撤销待确认的转移请求 */
  async cancelTransfer(uid: string, requestId: string): Promise<{ code: number }> {
    await this.expirePendingTransfers()
    const request = await this.prisma.transferRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('转移请求不存在')
    if (request.fromUserId !== uid) throw new ForbiddenException('仅发起人可以撤销该请求')
    if (request.status !== 'pending') throw new ConflictException('该请求已处理或已过期')

    const claimed = await this.prisma.transferRequest.updateMany({
      where: { id: request.id, status: 'pending' },
      data: { status: 'revoked' },
    })
    if (claimed.count !== 1) throw new ConflictException('该请求已处理或已过期')
    return { code: 0 }
  }

  /** 邀请详情（仅被邀请人/邀请人可查看；pending 且过期先置 expired） */
  async invitationDetail(uid: string, id: string): Promise<InvitationDetailDto> {
    await this.expirePendingInvitations()
    const invitation = await this.prisma.enterpriseInvitation.findUnique({ where: { id } })
    if (!invitation) throw new NotFoundException('邀请不存在或已失效')
    if (invitation.inviteeUid !== uid && invitation.inviterId !== uid) throw new ForbiddenException('无权查看该邀请')

    const ent = await this.prisma.enterprise.findUnique({ where: { id: invitation.enterpriseId } })
    const inviterNames = await this.nicknamesOf([invitation.inviterId])
    return {
      ...this.invitationShape(invitation, ent?.name ?? '', inviterNames),
      ...(ent?.logo ? { enterpriseLogo: ent.logo } : {}),
      enterpriseIndustry: ent?.industry ?? '',
      enterpriseSize: ent?.size ?? '',
    }
  }

  /** 被邀请人接受/拒绝；accept 单事务写邀请状态并创建 community_enterprise 身份 */
  async respondInvitation(uid: string, id: string, dto: RespondActionDto): Promise<{ code: number }> {
    await this.expirePendingInvitations()
    const invitation = await this.prisma.enterpriseInvitation.findUnique({ where: { id } })
    if (!invitation) throw new NotFoundException('邀请不存在或已失效')
    if (invitation.inviteeUid !== uid) throw new ForbiddenException('仅被邀请人可以处理该邀请')
    if (invitation.status !== 'pending') throw new ConflictException('该邀请已处理或已过期')

    const ent = await this.prisma.enterprise.findUnique({ where: { id: invitation.enterpriseId } })
    if (!ent) throw new NotFoundException('企业不存在')
    const me = await this.requireUser(uid)

    if (dto.action === 'accept') {
      const dup = await this.prisma.userIdentity.findFirst({
        where: { userId: uid, type: 'community_enterprise', enterpriseId: ent.id },
        select: { id: true },
      })
      if (dup) throw new ConflictException('该用户已是企业成员')
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.enterpriseInvitation.updateMany({
          where: { id: invitation.id, status: 'pending' },
          data: { status: 'accepted', respondedAt: formatNow() },
        })
        if (claimed.count !== 1) throw new ConflictException('该邀请已处理或已过期')
        await tx.userIdentity.create({
          data: {
            userId: uid,
            type: 'community_enterprise',
            enterpriseId: ent.id,
            enterpriseName: ent.name,
            role: 'member',
            title: invitation.role,
            memberPhone: invitation.phone,
          },
        })
      })
      await this.notify.pushNotice(invitation.inviterId, {
        type: 'invite',
        title: '邀请已被接受',
        content: `${me.nickname} 已接受邀请，加入「${ent.name}」（${invitation.role}）。`,
        link: `/me/enterprises/${ent.id}`,
      })
      return { code: 0 }
    }

    const claimed = await this.prisma.enterpriseInvitation.updateMany({
      where: { id: invitation.id, status: 'pending' },
      data: { status: 'rejected', respondedAt: formatNow() },
    })
    if (claimed.count !== 1) throw new ConflictException('该邀请已处理或已过期')
    await this.notify.pushNotice(invitation.inviterId, {
      type: 'invite',
      title: '邀请已被拒绝',
      content: `${me.nickname} 拒绝了加入「${ent.name}」的邀请。`,
      link: `/me/enterprises/${ent.id}`,
    })
    return { code: 0 }
  }

  /** 撤销待接受的邀请（仅邀请人，需 invite_member 权限） */
  async revokeInvitation(uid: string, invitationId: string): Promise<{ code: number }> {
    await this.expirePendingInvitations()
    const invitation = await this.prisma.enterpriseInvitation.findUnique({ where: { id: invitationId } })
    if (!invitation) throw new NotFoundException('邀请不存在或已失效')
    if (invitation.inviterId !== uid) throw new ForbiddenException('无权撤销该邀请')
    if (!(await this.hasPermission(uid, invitation.enterpriseId, 'invite_member'))) throw new ForbiddenException('你没有该操作权限')
    if (invitation.status !== 'pending') throw new ConflictException('该邀请已处理或已过期')

    const ent = await this.prisma.enterprise.findUnique({ where: { id: invitation.enterpriseId }, select: { name: true } })
    const claimed = await this.prisma.enterpriseInvitation.updateMany({
      where: { id: invitation.id, status: 'pending' },
      data: { status: 'revoked' },
    })
    if (claimed.count !== 1) throw new ConflictException('该邀请已处理或已过期')
    await this.notify.pushNotice(invitation.inviteeUid, {
      type: 'invite',
      title: '企业邀请已撤销',
      content: `「${ent?.name ?? ''}」的成员邀请已被撤销。`,
    })
    return { code: 0 }
  }

  /** 退驻申请（仅负责人；同企业仅一条 pending，写 Application type=exit） */
  async submitExitApplication(uid: string, id: string, dto: ExitApplicationDto): Promise<{ code: number }> {
    const { ent } = await this.requireMemberEnterprise(uid, id)
    if (ent.contactUserId !== uid) throw new ForbiddenException('只有负责人可以申请退驻')
    const dup = await this.prisma.application.findFirst({
      where: { type: 'exit', targetName: ent.name, status: 'pending', deletedAt: null },
      select: { id: true },
    })
    if (dup) throw new ConflictException('已存在待处理的退驻申请')

    const me = await this.requireUser(uid)
    const now = formatNow()
    await this.prisma.application.create({
      data: {
        id: await this.ids.next('AP'),
        type: 'exit',
        applicantName: me.nickname,
        applicantPhone: me.phone ?? '',
        targetName: ent.name,
        summary: `退驻申请：${ent.name}`,
        details: [{ label: '退驻原因', value: dto.reason?.trim() ?? '' }] as unknown as Prisma.InputJsonValue,
        records: [{ action: '提交申请', at: now, operator: me.nickname }] as unknown as Prisma.InputJsonValue,
        status: 'pending',
        submittedAt: now,
      },
    })
    return { code: 0 }
  }

  /** 公开企业名片（仅 active 且未删除可见；services/advantages 数组拼接为文本） */
  async enterpriseShowcase(id: string): Promise<EnterpriseShowcaseDto> {
    const ent = await this.prisma.enterprise.findFirst({ where: { id, deletedAt: null, status: 'active' } })
    if (!ent) throw new NotFoundException('企业名片不存在')

    const identityRows = await this.prisma.userIdentity.findMany({
      where: { type: 'community_enterprise', enterpriseId: ent.id },
      include: { user: { select: { nickname: true } } },
      orderBy: { id: 'asc' },
    })
    const servicesText = this.toText(ent.services)
    const advantagesText = this.toText(ent.advantages)
    return {
      id: ent.id,
      name: ent.name,
      ...(ent.logo ? { logo: ent.logo } : {}),
      industry: ent.industry,
      size: ent.size,
      ...(ent.foundedAt ? { foundedAt: ent.foundedAt } : {}),
      ...(ent.website ? { website: ent.website } : {}),
      ...(ent.address ? { address: ent.address } : {}),
      ...(servicesText ? { services: servicesText } : {}),
      ...(advantagesText ? { advantages: advantagesText } : {}),
      description: ent.description,
      members: identityRows.map((row) => row.user.nickname),
    }
  }

  /** 权限判定：负责人隐式全量；成员按 identity.permissions 包含判定；非成员/企业不存在为 false */
  async hasPermission(uid: string, enterpriseId: string, perm: EnterprisePermission): Promise<boolean> {
    try {
      await assertEnterprisePermission(this.prisma, uid, enterpriseId, perm)
      return true
    } catch {
      return false
    }
  }

  /* ---------- 私有辅助 ---------- */

  private async requireUser(uid: string): Promise<User & { identities: UserIdentity[] }> {
    const user = await this.prisma.user.findUnique({ where: { uid }, include: { identities: { orderBy: { id: 'asc' } } } })
    if (!user) throw new NotFoundException('用户不存在')
    return user
  }

  /** 管理端点成员校验：企业不存在 / 已删除 / 非成员统一 404 */
  private async requireMemberEnterprise(uid: string, enterpriseId: string): Promise<{ ent: Enterprise; identity: UserIdentity | null }> {
    const ent = await this.prisma.enterprise.findUnique({ where: { id: enterpriseId } })
    if (!ent || ent.deletedAt) throw new NotFoundException('企业不存在或你不是成员')
    if (ent.contactUserId === uid) return { ent, identity: null }
    const identity = await this.prisma.userIdentity.findFirst({
      where: { userId: uid, type: 'community_enterprise', enterpriseId },
    })
    if (!identity) throw new NotFoundException('企业不存在或你不是成员')
    return { ent, identity }
  }

  /** 定位成员：仅按 memberUid 精确定位（写操作需明确目标，避免按 title/name 模糊回退误伤重名成员） */
  private async locateMember(enterpriseId: string, memberUid?: string): Promise<UserIdentity> {
    if (memberUid) {
      const byUid = await this.prisma.userIdentity.findFirst({
        where: { userId: memberUid, type: 'community_enterprise', enterpriseId },
      })
      if (byUid) return byUid
    }
    throw new NotFoundException('未找到该企业成员')
  }

  /** 有效期：now + N 天（Date 计算，分钟精度字符串与 formatNow 字典序可比较） */
  private expiresAfter(days: number): string {
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  /** 惰性过期：pending 且 expiresAt < now 的企业邀请批量置 expired（时间字符串字典序即时间序） */
  private async expirePendingInvitations(): Promise<void> {
    await this.prisma.enterpriseInvitation.updateMany({
      where: { status: 'pending', expiresAt: { lt: formatNow() } },
      data: { status: 'expired' },
    })
  }

  /** 惰性过期：pending 且 expiresAt < now 的转移请求批量置 expired */
  private async expirePendingTransfers(): Promise<void> {
    await this.prisma.transferRequest.updateMany({
      where: { status: 'pending', expiresAt: { lt: formatNow() } },
      data: { status: 'expired' },
    })
  }

  /** string[] → 展示文本（、 连接；空数组返回 undefined 以省略键） */
  private toText(list: string[]): string | undefined {
    const text = list.join('、').trim()
    return text || undefined
  }

  /** 入参 → string[]（字符串按 、，,;换行 拆分；数组逐项清洗） */
  private toArray(value: string | string[]): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
    return String(value)
      .split(/[、，,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  /** 从 Application.details 提取退驻原因（label=退驻原因 的 value） */
  private exitReason(details: Prisma.JsonValue): string | undefined {
    if (!Array.isArray(details)) return undefined
    const hit = details.find((d) => (d as Record<string, unknown>)?.label === '退驻原因') as Record<string, unknown> | undefined
    const text = hit?.value == null ? '' : String(hit.value).trim()
    return text || undefined
  }

  private async nicknamesOf(uids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(uids.filter(Boolean))]
    if (!unique.length) return new Map()
    const rows = await this.prisma.user.findMany({ where: { uid: { in: unique } }, select: { uid: true, nickname: true } })
    return new Map(rows.map((r) => [r.uid, r.nickname]))
  }

  private async enterpriseNamesOf(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return new Map()
    const rows = await this.prisma.enterprise.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  private invitationShape(invitation: EnterpriseInvitation, enterpriseName: string, inviterNames: Map<string, string>): EnterpriseInvitationDto {
    return {
      id: invitation.id,
      enterpriseId: invitation.enterpriseId,
      enterpriseName,
      memberName: invitation.memberName,
      phone: invitation.phone,
      role: invitation.role,
      inviterName: inviterNames.get(invitation.inviterId) ?? '',
      status: invitation.status,
      at: invitation.createdAt,
      ...(invitation.respondedAt ? { respondedAt: invitation.respondedAt } : {}),
      ...(invitation.expiresAt ? { expiresAt: invitation.expiresAt } : {}),
    }
  }

  private transferShape(request: TransferRequest, enterpriseName: string, names: Map<string, string>): EnterpriseTransferRequestDto {
    return {
      id: request.id,
      enterpriseId: request.enterpriseId,
      enterpriseName,
      fromUid: request.fromUserId,
      fromName: names.get(request.fromUserId) ?? '',
      toUid: request.toUserId,
      toName: names.get(request.toUserId) ?? '',
      status: request.status,
      at: request.createdAt,
      ...(request.respondedAt ? { respondedAt: request.respondedAt } : {}),
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    }
  }
}
