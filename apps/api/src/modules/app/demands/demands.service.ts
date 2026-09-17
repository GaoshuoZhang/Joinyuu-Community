import type { Request } from 'express'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { AppJwtPayload } from '../../../common/interfaces/app-jwt-payload'
import { Prisma, type Demand, type DemandRespondent, type User } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { NotificationService } from '../../../common/notify/notification.service'
import { PointsEngineService } from '../../../common/engine/points-engine/points-engine.service'
import { formatNow } from '../../../common/utils/time'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'
import { assertRealnameAllowed } from '../realname/realname.service'
import { consumePublishingLimit } from '../../../common/enterprise/publishing-limits'
import { assertEnterprisePermission } from '../../../common/enterprise/enterprise-permission'
import type { CreateDemandDto } from './dto/create-demand.dto'
import type { RespondDemandDto } from './dto/respond-demand.dto'
import type { SelectRespondersDto } from './dto/select-responders.dto'
import type { DemandMessageDto } from './dto/demand-message.dto'

/** 响应方/发布方身份类型集合（用于可见范围过滤与代企业主体判定） */
interface IdentitySummary {
  type: string
  level?: number
  enterpriseId?: string
  enterpriseName?: string
}

/* 需求广场（M2-R R2，/api/app/demands + /me/demands、/me/responses）：
 * 浏览公开需求（剔除联系人，游客不可见联系人）、提交/响应/撤回/重提/申诉、发布者审阅响应并立项生成协作项目。 */

@Injectable()
export class AppDemandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly points: PointsEngineService,
    private readonly jwt: JwtService,
  ) {}

  /** 需求广场列表（仅 published，服务端可见范围过滤；kind/类目/关键词/分页） */
  async list(query: { kind?: string; category?: string; keyword?: string; page?: number; pageSize?: number }, req: Request) {
    const uid = await this.optionalUid(req)
    const identities = await this.identitySet(uid)
    const blockedUids = await this.blockedUids(uid)

    const where: Prisma.DemandWhereInput = {
      status: 'published',
      deletedAt: null,
      AND: [this.visibilityCond(identities)],
      ...(blockedUids.length ? { publisherId: { notIn: blockedUids } } : {}),
    }
    if (query.kind) where.demandType = query.kind
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { description: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.category) {
      const code = await this.resolveCategoryCode(query.category)
      if (code) where.category = code
      else return { list: [], total: 0 }
    }

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 10
    const [total, rows] = await Promise.all([
      this.prisma.demand.count({ where }),
      this.prisma.demand.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])
    const counts = await this.responseCounts(rows.map((d) => d.id))
    return {
      list: rows.map((d) => this.toListItem(d, counts.get(d.id) ?? 0, !!uid)),
      total,
    }
  }

  /** 需求详情（不可见 → 404，不暴露存在性） */
  async detail(id: string, req: Request) {
    const uid = await this.optionalUid(req)
    const identities = await this.identitySet(uid)
    const blockedUids = await this.blockedUids(uid)

    const demand = await this.prisma.demand.findFirst({
      where: { id, deletedAt: null, ...(blockedUids.length ? { publisherId: { notIn: blockedUids } } : {}) },
    })
    /* 发布者可查看自己需求的全状态详情（「我的需求」点击进入）；其余人仅可看已发布的可见需求 */
    const isPublisher = !!uid && demand?.publisherId === uid
    if (!demand || (!isPublisher && (demand.status !== 'published' || !this.visibly(identities, demand)))) {
      throw new NotFoundException('需求不存在或不可见')
    }

    const count = (await this.responseCounts([demand.id])).get(demand.id) ?? 0
    /* 本人响应快照：撤回以 withdrawnAt 判别（撤回后视为未响应，可重新响应） */
    let myResponse: { message: string; at: string; status: string } | null = null
    if (uid) {
      const mine = await this.prisma.demandRespondent.findFirst({
        where: { demandId: demand.id, userId: uid, withdrawnAt: null },
        orderBy: { id: 'desc' },
        select: { message: true, at: true, status: true },
      })
      if (mine) myResponse = mine
    }

    return {
      ...this.toListItem(demand, count, !!uid),
      description: demand.description,
      visibilityIdentities: demand.visibilityIdentities,
      visibilityLevels: demand.visibilityLevels.map((l) => Number(l)),
      status: demand.status,
      createdAt: demand.createdAt,
      ...(demand.rejectedReason != null ? { rejectReason: demand.rejectedReason } : {}),
      ...(demand.projectId != null ? { projectId: demand.projectId } : {}),
      ...(myResponse ? { myResponse } : {}),
    }
  }

  /** 提交需求：demandOpen 开关校验 → 实名强制校验（分级权益）→ 身份快照 → status='pending'（管理端审核） */
  async create(uid: string, name: string, dto: CreateDemandDto) {
    await this.assertDemandOpen()
    await assertRealnameAllowed(this.prisma, uid, 'publish')
    this.assertKindFields(dto)
    const user = await this.requireUser(uid)
    const publisher = await this.resolvePublisher(uid, name, user, dto)

    const id = await this.ids.next('D')
    await this.prisma.$transaction(async tx => {
      const identity = publisher.identity as { type?: string; enterpriseId?: string } | null
      await consumePublishingLimit(tx, uid, 'demand_publish', { identityType: identity?.type, enterpriseId: identity?.enterpriseId })
      await tx.demand.create({
      data: {
        id,
        title: dto.title.trim(),
        description: sanitizeHtml(dto.description.trim()),
        category: dto.categoryCode,
        demandType: dto.kind,
        deliverable: dto.deliverable?.trim() || null,
        deliverBy: dto.deliverBy || null,
        cooperationNeed: dto.cooperationNeed?.trim() || null,
        returnOffer: dto.returnOffer?.trim() || null,
        bottleneck: dto.bottleneck?.trim() || null,
        partnershipMode: dto.partnershipMode?.trim() || null,
        publisherId: uid,
        publisherName: publisher.name,
        publisherIdentity: publisher.identity ?? Prisma.DbNull,
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        contactEmail: dto.contactEmail?.trim() || null,
        budget: dto.budget?.trim() || '面议',
        period: '',
        deadline: '',
        visibilityIdentities: dto.visibilityIdentities ?? [],
        visibilityLevels: (dto.visibilityLevels ?? []).map(String),
        enrollmentIdentities: [],
        enrollmentLevels: [],
        status: 'pending',
        createdAt: formatNow(),
        tags: [],
      },
      })
    })
    return { id }
  }

  /** 我发布的需求（全状态，可 status 筛选；直接返回数组对齐客户端） */
  async myDemands(uid: string, status?: string) {
    const where: Prisma.DemandWhereInput = { publisherId: uid }
    if (status) where.status = status
    const rows = await this.prisma.demand.findMany({ where, orderBy: { createdAt: 'desc' } })
    const counts = await this.responseCounts(rows.map((d) => d.id))
    return rows.map((d) => {
      const item = this.toListItem(d, counts.get(d.id) ?? 0, true)
      return {
        id: item.id,
        title: item.title,
        categoryLabel: item.categoryLabel,
        status: d.status,
        kind: item.kind,
        responseCount: item.responseCount,
        createdAt: d.createdAt,
        ...(d.rejectedReason != null ? { rejectReason: d.rejectedReason } : {}),
      }
    })
  }

  /** 响应需求：published + 不能响应自己 + 防重复 + 代企业权限 → 写响应 + demand_responded 积分 */
  async respond(uid: string, id: string, dto: RespondDemandDto) {
    const demand = await this.requireDemand(id)
    if (demand.status !== 'published') throw new ConflictException('仅已发布的需求可响应')
    if (demand.publisherId === uid) throw new ConflictException('不能响应自己发布的需求')

    const dup = await this.prisma.demandRespondent.findFirst({
      where: { demandId: demand.id, userId: uid, status: { in: ['pending', 'accepted'] } },
      select: { id: true },
    })
    if (dup) throw new ConflictException('您已响应过该需求')

    const user = await this.requireUser(uid)
    const responder = await this.resolveResponder(uid, user, dto)

    const at = formatNow()
    await this.prisma.demandRespondent.create({
      data: {
        demandId: demand.id,
        userId: uid,
        responderIdentity: responder.identity ?? Prisma.DbNull,
        name: responder.name,
        enterprise: responder.enterprise,
        phone: responder.phone || null,
        email: null,
        quote: dto.quote?.trim() || null,
        message: dto.note?.trim() || '响应需求',
        at,
        status: 'pending',
      },
    })

    await this.points.issuePoints(uid, 'demand_responded', '响应需求获得积分', `demand_responded:${uid}:${demand.id}:${at}`)
    return { code: 0 }
  }

  /** 响应者撤回（仅 pending → closed + withdrawnAt） */
  async withdrawResponse(uid: string, responseId: string) {
    const response = await this.requireResponseOf(responseId, uid)
    if (response.status !== 'pending') throw new ConflictException('响应已被处理，无法撤回')
    await this.prisma.demandRespondent.update({
      where: { id: response.id },
      data: { status: 'closed', withdrawnAt: formatNow() },
    })
    return { code: 0 }
  }

  /** 我的响应记录（对接客户端 fetchMyResponses：MyResponseItem[] 数组） */
  async myResponses(uid: string) {
    const rows = await this.prisma.demandRespondent.findMany({
      where: { userId: uid },
      orderBy: { id: 'desc' },
    })
    const ids = rows.map((r) => r.demandId)
    const demands = await this.prisma.demand.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, status: true },
    })
    const byId = new Map(demands.map((d) => [d.id, d]))
    return rows.map((r) => ({
      id: r.id,
      demandId: r.demandId,
      demandTitle: byId.get(r.demandId)?.title ?? '',
      demandStatus: byId.get(r.demandId)?.status ?? '',
      note: r.message,
      at: r.at,
      status: r.status,
      ...(r.quote != null ? { quote: r.quote } : {}),
    }))
  }

  /** 需求发布者查看响应列表（非发布者 403） */
  async demandResponses(uid: string, demandId: string) {
    const demand = await this.requireOwnDemand(uid, demandId)
    const rows = await this.prisma.demandRespondent.findMany({
      where: { demandId: demand.id },
      orderBy: { id: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      demandId: demand.id,
      demandTitle: demand.title,
      note: r.message,
      at: r.at,
      ...(r.userId != null ? { responderUid: r.userId } : {}),
      responderName: r.name,
      ...(r.responderIdentity != null ? { responderIdentity: this.identityType(r.responderIdentity) } : {}),
      status: r.status === 'pending' || r.status === 'accepted' || r.status === 'rejected' ? (r.status as 'pending' | 'accepted' | 'rejected') : undefined,
      ...(r.reviewAt != null ? { reviewedAt: r.reviewAt } : {}),
      ...(r.rejectReason != null ? { rejectReason: r.rejectReason } : {}),
    }))
  }

  /**
   * 发布者选择意向承接方（单选/多选）并提交立项申请：published → selected。
   * 不可驳回响应（未选中的响应保持待处理）；实际立项由社区管理员完成。
   */
  async selectResponders(uid: string, demandId: string, dto: SelectRespondersDto) {
    const demand = await this.requireOwnDemand(uid, demandId)
    if (demand.status !== 'published') throw new ConflictException('仅已发布的需求可选择承接方')

    const ids = [...new Set((dto.responseIds ?? []).filter((n) => Number.isInteger(n) && n > 0))]
    if (ids.length === 0) throw new BadRequestException('请至少选择一位意向承接方')

    const responses = await this.prisma.demandRespondent.findMany({
      where: { id: { in: ids }, demandId: demand.id, withdrawnAt: null },
      orderBy: { id: 'asc' },
    })
    if (responses.length !== ids.length) throw new NotFoundException('响应不存在或已撤回')

    await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.demandRespondent.updateMany({
        where: { id: { in: ids }, demandId: demand.id, withdrawnAt: null, status: 'pending' },
        data: { status: 'accepted', reviewAt: formatNow() },
      })
      if (accepted.count !== ids.length) throw new ConflictException('响应状态已变化，请刷新后重试')

      /* 需求转 selected：客户端列表/详情不再展示，也不接受新响应；等待管理员立项 */
      const selected = await tx.demand.updateMany({
        where: { id: demand.id, status: 'published', projectId: null },
        data: { status: 'selected', matchedRespondent: responses.map((r) => r.name).join('、') },
      })
      if (selected.count !== 1) throw new ConflictException('需求状态已变化，请刷新后重试')

      for (const response of responses) {
        if (!response.userId) continue
        await this.notify.pushNoticeInTransaction(tx, response.userId, {
          type: 'demand',
          title: '已被选为意向承接方',
          content: `您响应的需求「${demand.title}」已选择您作为意向承接方，等待社区管理员立项。`,
          link: `/demands/${demand.id}`,
        })
      }
    })
    return { code: 0 }
  }

  /** 审核中撤回：pending → withdrawn（保留编号） */
  async withdrawDemand(uid: string, demandId: string) {
    const demand = await this.requireOwnDemand(uid, demandId)
    if (demand.status !== 'pending') throw new ConflictException('仅待审核的需求可撤回')
    await this.prisma.demand.update({ where: { id: demand.id }, data: { status: 'withdrawn' } })
    return { code: 0 }
  }

  /** 驳回/撤回后重提：withdrawn|rejected → pending（保留编号，可改字段） */
  async resubmitDemand(uid: string, demandId: string, dto: CreateDemandDto) {
    await this.assertDemandOpen()
    const demand = await this.requireOwnDemand(uid, demandId)
    if (demand.status !== 'withdrawn' && demand.status !== 'rejected') {
      throw new ConflictException('仅已撤回或已驳回的需求可重新提交')
    }
    this.assertKindFields(dto)
    const user = await this.requireUser(uid)
    const publisher = await this.resolvePublisher(uid, '', user, dto)

    await this.prisma.$transaction(async tx => {
      const identity = publisher.identity as { type?: string; enterpriseId?: string } | null
      await consumePublishingLimit(tx, uid, 'demand_publish', { identityType: identity?.type, enterpriseId: identity?.enterpriseId })
      const changed = await tx.demand.updateMany({
      where: { id: demand.id, status: { in: ['withdrawn', 'rejected'] }, deletedAt: null },
      data: {
        title: dto.title.trim(),
        description: sanitizeHtml(dto.description.trim()),
        category: dto.categoryCode,
        demandType: dto.kind,
        deliverable: dto.deliverable?.trim() || null,
        deliverBy: dto.deliverBy || null,
        cooperationNeed: dto.cooperationNeed?.trim() || null,
        returnOffer: dto.returnOffer?.trim() || null,
        bottleneck: dto.bottleneck?.trim() || null,
        partnershipMode: dto.partnershipMode?.trim() || null,
        publisherName: publisher.name,
        publisherIdentity: publisher.identity ?? Prisma.DbNull,
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        contactEmail: dto.contactEmail?.trim() || null,
        budget: dto.budget?.trim() || '面议',
        visibilityIdentities: dto.visibilityIdentities ?? [],
        visibilityLevels: (dto.visibilityLevels ?? []).map(String),
        status: 'pending',
        rejectedReason: null,
      },
      })
      if (changed.count !== 1) throw new ConflictException('需求状态已变化，请刷新后重试')
    })
    return { code: 0 }
  }

  /** 驳回/撤回需求的表单回填载荷。 */
  async demandPayload(uid: string, demandId: string): Promise<CreateDemandDto> {
    const demand = await this.requireOwnDemand(uid, demandId)
    const identity = (demand.publisherIdentity ?? null) as Record<string, unknown> | null
    return {
      kind: (demand.demandType ?? 'task') as CreateDemandDto['kind'],
      title: demand.title,
      description: demand.description,
      categoryDict: demand.demandType === 'investment' ? 'industry' : 'demand_category',
      categoryCode: demand.category,
      asIdentity: typeof identity?.type === 'string' ? identity.type : 'individual',
      asEnterpriseId: typeof identity?.enterpriseId === 'string' ? identity.enterpriseId : undefined,
      contactName: demand.contactName ?? '',
      contactPhone: demand.contactPhone ?? '',
      contactEmail: demand.contactEmail ?? undefined,
      deliverable: demand.deliverable ?? undefined,
      deliverBy: demand.deliverBy ?? undefined,
      budget: demand.budget || undefined,
      cooperationNeed: demand.cooperationNeed ?? undefined,
      bottleneck: demand.bottleneck ?? undefined,
      partnershipMode: demand.partnershipMode ?? undefined,
      returnOffer: demand.returnOffer ?? undefined,
      visibilityIdentities: demand.visibilityIdentities,
      visibilityLevels: demand.visibilityLevels.map(Number).filter(Number.isFinite),
    }
  }

  /** 驳回后一次性申诉：rejected → appealed（管理端复核） */
  async appealDemand(uid: string, demandId: string, reason: string) {
    const demand = await this.requireOwnDemand(uid, demandId)
    if (demand.status !== 'rejected') throw new ConflictException('仅被驳回的需求可申诉')
    const appealReason = (reason ?? '').trim()
    if (!appealReason) throw new BadRequestException('请填写申诉原因')
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.demand.updateMany({
        where: { id: demand.id, status: 'rejected' },
        data: { status: 'appealed' },
      })
      if (claimed.count !== 1) throw new ConflictException('该需求已申诉，请勿重复提交')
      await tx.appeal.create({
        data: {
          appellantId: uid,
          targetType: 'demand',
          targetId: demand.id,
          reason: appealReason,
          createdAt: formatNow(),
        },
      })
    })
    return { code: 0 }
  }

  /** 需求沟通留言：GET（仅发布方与响应过者可见） */
  async listMessages(uid: string, demandId: string) {
    await this.assertMessageAccess(uid, demandId)
    const rows = await this.prisma.demandMessage.findMany({
      where: { demandId },
      orderBy: { id: 'asc' },
    })
    return rows.map((m) => ({
      id: m.id,
      uid: m.senderId,
      name: m.senderName,
      content: m.content,
      at: m.at,
      mine: m.senderId === uid,
    }))
  }

  /** 需求沟通留言：POST（同上权限；content 1-500 字） */
  async postMessage(uid: string, name: string, demandId: string, dto: DemandMessageDto) {
    await this.assertMessageAccess(uid, demandId)
    const content = dto.content?.trim() ?? ''
    if (!content) throw new BadRequestException('留言内容不能为空')
    if (content.length > 500) throw new BadRequestException('留言不能超过 500 字')
    await this.prisma.demandMessage.create({
      data: { demandId, senderId: uid, senderName: name || '用户', content, at: formatNow() },
    })
    return { code: 0 }
  }

  /* ---------- 内部工具 ---------- */

  private async assertDemandOpen(): Promise<void> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (cfg && cfg.demandOpen === false) throw new BadRequestException('需求发布暂未开放')
  }

  private async blockedUids(uid?: string | null): Promise<string[]> {
    if (!uid) return []
    const rows = await this.prisma.userBlock.findMany({ where: { userId: uid }, select: { blockedUid: true } })
    return rows.map((row) => row.blockedUid)
  }

  /** 按需求类型的必填校验（对齐 docs/api-app-design.md §6） */
  private assertKindFields(dto: CreateDemandDto): void {
    const title = dto.title?.trim()
    const description = dto.description?.trim()
    if (!title) throw new BadRequestException(dto.kind === 'investment' ? '请输入项目名称' : '请输入需求标题')
    if (!description) throw new BadRequestException(dto.kind === 'investment' ? '请输入项目简介' : dto.kind === 'cooperation' ? '请描述业务现状与瓶颈' : '请输入需求描述')
    if (!dto.categoryCode) throw new BadRequestException(dto.kind === 'investment' ? '请选择所属行业' : '请选择需求类别')

    const contactName = dto.contactName?.trim() ?? ''
    const contactPhone = dto.contactPhone?.trim() ?? ''
    if (!contactName) throw new BadRequestException('请输入联系人')
    if (!/^1\d{10}$/.test(contactPhone)) throw new BadRequestException('请输入正确的联系电话')
    if (dto.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.contactEmail)) throw new BadRequestException('请输入正确的联系邮箱')

    if (dto.kind === 'task') {
      if (!dto.deliverable?.trim()) throw new BadRequestException('请输入期望交付')
      if (!dto.deliverBy) throw new BadRequestException('请选择预期交付日期')
    } else if (dto.kind === 'investment') {
      if (!dto.cooperationNeed?.trim()) throw new BadRequestException('请输入希望获得的投资 / 合作')
    } else {
      if (!dto.bottleneck?.trim()) throw new BadRequestException('请描述业务瓶颈与合作诉求')
    }
  }

  private async requireUser(uid: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { uid } })
    if (!user) throw new NotFoundException('用户不存在')
    return user
  }

  private async requireDemand(id: string): Promise<Demand> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand || demand.deletedAt) throw new NotFoundException('需求不存在')
    return demand
  }

  /** 仅发布者可操作：非发布者 403 */
  private async requireOwnDemand(uid: string, demandId: string): Promise<Demand> {
    const demand = await this.requireDemand(demandId)
    if (demand.publisherId !== uid) throw new ForbiddenException('无权操作该需求')
    return demand
  }

  private async requireResponseOf(responseId: string, uid: string): Promise<DemandRespondent> {
    const response = await this.prisma.demandRespondent.findFirst({ where: { id: this.toNum(responseId), userId: uid } })
    if (!response) throw new NotFoundException('响应不存在')
    return response
  }

  /** 发布方或响应过者可见留言板，否则 403 */
  private async assertMessageAccess(uid: string, demandId: string): Promise<void> {
    const demand = await this.requireDemand(demandId)
    if (demand.publisherId === uid) return
    const responded = await this.prisma.demandRespondent.findFirst({
      where: { demandId, userId: uid },
      select: { id: true },
    })
    if (!responded) throw new ForbiddenException('您无权查看该需求的沟通留言')
  }

  /* ---------- 身份/主体快照解析 ---------- */

  /** 当前登录用户身份集合（用于可见范围；游客返回空） */
  private async identitySet(uid: string | null): Promise<IdentitySummary[]> {
    if (!uid) return []
    const rows = await this.prisma.userIdentity.findMany({ where: { userId: uid } })
    if (rows.length === 0) return [{ type: 'individual' }]
    return rows.map((i) => ({
      type: i.type,
      level: i.level ?? undefined,
      enterpriseId: i.enterpriseId ?? undefined,
      enterpriseName: i.enterpriseName ?? undefined,
    }))
  }

  /** 发布方主体快照：企业名/组织名/昵称 + 身份 Json */
  private async resolvePublisher(
    uid: string,
    fallbackName: string,
    user: User,
    dto: CreateDemandDto,
  ): Promise<{ name: string; identity: Prisma.InputJsonValue | null }> {
    const identities = await this.prisma.userIdentity.findMany({ where: { userId: uid } })

    if (dto.asEnterpriseId) {
      await assertEnterprisePermission(this.prisma, uid, dto.asEnterpriseId, 'publish_demand')
      const ent = await this.prisma.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!ent) throw new BadRequestException('企业不存在')
      return {
        name: ent.name,
        identity: { type: 'community_enterprise', enterpriseId: ent.id, enterpriseName: ent.name, role: 'member', title: '社区企业成员' },
      }
    }

    if (dto.asIdentity === 'community_enterprise') {
      throw new BadRequestException('请选择要代表的社区企业')
    }

    const asIdentity = dto.asIdentity ?? this.defaultIdentity(identities)
    if (asIdentity === 'community_individual' && identities.some((i) => i.type === 'community_individual')) {
      return { name: user.nickname, identity: { type: 'community_individual', title: '社区个体', level: null } }
    }
    if (asIdentity === 'external_enterprise') {
      const ext = identities.find((i) => i.type === 'external_enterprise')
      return {
        name: ext?.enterpriseName || user.nickname,
        identity: { type: 'external_enterprise', enterpriseName: ext?.enterpriseName ?? null },
      }
    }
    if (asIdentity === 'community_enterprise') {
      const ent = identities.find((i) => i.type === 'community_enterprise')
      if (ent) {
        if (!ent.enterpriseId) throw new BadRequestException('请选择要代表的社区企业')
        await assertEnterprisePermission(this.prisma, uid, ent.enterpriseId, 'publish_demand')
        const enterprise = ent.enterpriseId ? await this.prisma.enterprise.findUnique({ where: { id: ent.enterpriseId } }) : null
        return {
          name: enterprise?.name ?? ent.enterpriseName ?? user.nickname,
          identity: { type: 'community_enterprise', enterpriseId: ent.enterpriseId, enterpriseName: ent.enterpriseName ?? null, role: ent.role ?? 'member' },
        }
      }
    }
    return { name: user.nickname || fallbackName, identity: { type: 'individual', title: '个人用户' } }
  }

  /** 响应方主体快照 */
  private async resolveResponder(
    uid: string,
    user: User,
    dto: RespondDemandDto,
  ): Promise<{ name: string; enterprise: string; phone: string | null; identity: Prisma.InputJsonValue | null }> {
    if (dto.asEnterpriseId) {
      await assertEnterprisePermission(this.prisma, uid, dto.asEnterpriseId, 'respond_demand')
      const ent = await this.prisma.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!ent) throw new BadRequestException('企业不存在')
      return {
        name: user.realName || user.nickname,
        enterprise: ent.name,
        phone: ent.contactPhone || user.phone,
        identity: { type: 'community_enterprise', enterpriseId: ent.id, enterpriseName: ent.name, role: 'member' },
      }
    }

    if (dto.asIdentity === 'community_enterprise') {
      throw new BadRequestException('请选择要代表的社区企业')
    }

    const identities = await this.prisma.userIdentity.findMany({ where: { userId: uid } })
    const ce = identities.find((i) => i.type === 'community_enterprise' && i.enterpriseId)
    if (!dto.asIdentity && ce) {
      await assertEnterprisePermission(this.prisma, uid, ce.enterpriseId as string, 'respond_demand')
      return {
        name: user.realName || user.nickname,
        enterprise: ce?.enterpriseName || '',
        phone: user.phone,
        identity: ce ? { type: 'community_enterprise', enterpriseId: ce.enterpriseId, enterpriseName: ce.enterpriseName } : null,
      }
    }
    return {
      name: user.realName || user.nickname,
      enterprise: '',
      phone: user.phone,
      identity: { type: 'individual', title: '个人用户' },
    }
  }

  /* ---------- 可见范围 SQL 条件 ---------- */

  private visibilityCond(identities: IdentitySummary[]): Prisma.DemandWhereInput {
    const types = identities.map((i) => i.type)
    const levels = identities.flatMap((i) => (i.level != null ? [String(i.level)] : []))
    return {
      OR: [
        { visibilityIdentities: { isEmpty: true } },
        {
          visibilityIdentities: { hasSome: types },
          OR: [{ visibilityLevels: { isEmpty: true } }, { visibilityLevels: { hasSome: levels } }],
        },
      ],
    }
  }

  /** 单条详情可见性校验（含等级匹配） */
  private visibly(identities: IdentitySummary[], demand: Demand): boolean {
    if (demand.visibilityIdentities.length === 0) return true
    return identities.some((i) => {
      if (!demand.visibilityIdentities.includes(i.type)) return false
      if (demand.visibilityLevels.length === 0) return true
      return i.level != null && demand.visibilityLevels.includes(String(i.level))
    })
  }

  /** 分页响应数（排除已撤回 closed） */
  private async responseCounts(demandIds: string[]): Promise<Map<string, number>> {
    if (demandIds.length === 0) return new Map()
    const rows = await this.prisma.demandRespondent.groupBy({
      by: ['demandId'],
      where: { demandId: { in: demandIds }, status: { not: 'closed' } },
      _count: { demandId: true },
    })
    return new Map(rows.map((r) => [r.demandId, r._count.demandId]))
  }

  /** 类目参数（编码或标签）→ 字典 code；无法解析返回 null */
  private async resolveCategoryCode(input: string): Promise<string | null> {
    if (!input) return null
    const candidates = await this.prisma.dictEntry.findMany({
      where: { type: { in: ['demand_category', 'industry'] } },
      select: { code: true, label: true },
    })
    const hit = candidates.find((c) => c.code === input || c.label === input)
    return hit?.code ?? null
  }

  /** 列表/详情条目（联系人仅登录用户可见） */
  private toListItem(demand: Demand, responseCount: number, withContact: boolean) {
    return {
      id: demand.id,
      title: demand.title,
      description: demand.description,
      categoryLabel: demand.category,
      status: demand.status,
      kind: (demand.demandType ?? 'task') as 'task' | 'investment' | 'cooperation',
      publisherUid: demand.publisherId,
      publisherName: demand.publisherName,
      publisherIdentity: this.identityType(demand.publisherIdentity),
      responseCount,
      ...(withContact
        ? {
            contactName: demand.contactName ?? undefined,
            contactPhone: demand.contactPhone ?? undefined,
            contactEmail: demand.contactEmail ?? undefined,
          }
        : {}),
      ...(demand.deadline ? { deadline: demand.deadline } : {}),
      ...(demand.deliverBy ? { deliverBy: demand.deliverBy } : {}),
      ...(demand.deliverable ? { deliverable: demand.deliverable } : {}),
      ...(demand.budget && demand.budget !== '面议' ? { budget: demand.budget } : {}),
      ...(demand.cooperationNeed ? { cooperationNeed: demand.cooperationNeed } : {}),
      ...(demand.bottleneck ? { bottleneck: demand.bottleneck } : {}),
      ...(demand.partnershipMode ? { partnershipMode: demand.partnershipMode } : {}),
      ...(demand.returnOffer ? { returnOffer: demand.returnOffer } : {}),
    }
  }

  private identityType(json: Prisma.JsonValue | null | undefined): string {
    if (!json || typeof json !== 'object') return 'individual'
    const v = json as Record<string, unknown>
    return typeof v.type === 'string' ? v.type : 'individual'
  }

  /** 持有社区个体身份时默认社区个体，否则 individual */
  private defaultIdentity(identities: Array<{ type: string }>): string {
    const types = identities.map((i) => i.type)
    return types.includes('community_individual') ? 'community_individual' : 'individual'
  }

  /** @Public 浏览端点：读可选登录态（失败按游客处理） */
  private async optionalUid(req: Request): Promise<string | null> {
    const header = req.headers.authorization ?? ''
    if (!header.startsWith('Bearer ')) return null
    const token = header.slice(7)
    if (!token) return null
    try {
      const payload = await this.jwt.verifyAsync<AppJwtPayload>(token)
      return payload.scope === 'app' ? payload.sub : null
    } catch {
      return null
    }
  }

  private toNum(id: string): number {
    const n = Number.parseInt(id, 10)
    return Number.isNaN(n) ? -1 : n
  }
}
