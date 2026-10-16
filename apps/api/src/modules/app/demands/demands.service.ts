import type { Request } from 'express'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { RedisService } from '../../../common/redis/redis.service'
import { resolveOptionalAppUid, type OptionalAppAuthDeps } from '../../../common/auth/optional-app-uid'
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
import { respondentFieldVisible } from '../../../common/demands/respondent-fields'
import type { CreateDemandDto } from './dto/create-demand.dto'
import type { RespondDemandDto } from './dto/respond-demand.dto'
import type { SelectRespondersDto } from './dto/select-responders.dto'

/** 响应方/发布方身份类型集合（用于可见范围过滤与代企业主体判定） */
interface IdentitySummary {
  type: string
  level?: number
  enterpriseId?: string
  enterpriseName?: string
}

/* 需求广场（M2-R R2，/api/app/demands + /me/demands、/me/responses）：
 * 浏览公开需求（剔除联系人，游客不可见联系人）、提交/响应/撤回/重提、发布者审阅响应并立项生成协作项目。 */

@Injectable()
export class AppDemandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly notify: NotificationService,
    private readonly points: PointsEngineService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  /** 可选登录态解析依赖（与 AppJwtGuard 同口径） */
  private get auth(): OptionalAppAuthDeps {
    return { jwt: this.jwt, redis: this.redis, prisma: this.prisma }
  }

  /** 需求广场列表（仅 published，服务端可见范围过滤；kind/类目/关键词/分页） */
  async list(query: { kind?: string; category?: string; keyword?: string; page?: number; pageSize?: number }, req: Request) {
    const uid = await this.optionalUid(req)
    const identities = await this.identitySet(uid)

    const where: Prisma.DemandWhereInput = {
      status: 'published',
      deletedAt: null,
      AND: [this.visibilityCond(identities)],
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
      const values = await this.resolveCategoryValues(query.category)
      if (values) where.category = { in: values }
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
    return { list: await this.toListItems(rows, counts), total }
  }

  /** 需求详情（不可见 → 404，不暴露存在性） */
  async detail(id: string, req: Request) {
    const uid = await this.optionalUid(req)
    const identities = await this.identitySet(uid)

    const demand = await this.prisma.demand.findFirst({
      where: { id, deletedAt: null },
    })
    const participation = uid && demand
      ? await this.prisma.demandRespondent.findFirst({ where: { demandId: id, userId: uid }, select: { id: true } })
      : null
    /* 发布者和响应者可查看关联需求的全状态详情；其他人仅可看公开且范围匹配的需求。 */
    const isPublisher = !!uid && demand?.publisherId === uid
    const isRespondent = !!participation
    const isPubliclyVisible = !!demand
      && demand.status === 'published'
      && this.visibly(identities, demand)
    if (!demand || (!isPublisher && !isRespondent && !isPubliclyVisible)) {
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

    const [item] = await this.toListItems([demand], new Map([[demand.id, count]]))
    return {
      ...item,
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
    await this.assertCategoryCode(dto)
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
    const items = await this.toListItems(rows, counts)
    return items.map((item, index) => {
      const d = rows[index]
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
    await this.assertDemandOpen('响应')
    const demand = await this.requireDemand(id)
    if (demand.status !== 'published') throw new ConflictException('仅已发布的需求可响应')
    if (demand.publisherId === uid) throw new ConflictException('不能响应自己发布的需求')

    const identities = await this.identitySet(uid)
    if (!this.visibly(identities, demand)) throw new NotFoundException('需求不存在或不可见')

    const dup = await this.prisma.demandRespondent.findFirst({
      where: { demandId: demand.id, userId: uid, status: { in: ['pending', 'pending_review', 'accepted'] }, withdrawnAt: null },
      select: { id: true },
    })
    if (dup) throw new ConflictException('您已响应过该需求')

    const user = await this.requireUser(uid)
    const responder = await this.resolveResponder(uid, user, dto)

    /* 已响应后不可更换身份重复响应；同一公司（社区/合作企业）其他成员不可再次响应（撤回视为未响应） */
    const requestedSubject = this.subjectKey(responder.identity)
    const mine = await this.prisma.demandRespondent.findMany({
      where: { demandId: demand.id, userId: uid, withdrawnAt: null },
      select: { responderIdentity: true },
    })
    if (mine.some((row) => this.subjectKey(row.responderIdentity) !== requestedSubject)) {
      throw new ConflictException('您已响应过该需求，不能更换身份重复响应')
    }
    const isCompany = requestedSubject.startsWith('community_enterprise:') || requestedSubject.startsWith('external_enterprise:')
    if (isCompany) {
      const others = await this.prisma.demandRespondent.findMany({
        where: { demandId: demand.id, userId: { not: uid }, withdrawnAt: null },
        select: { responderIdentity: true },
      })
      if (others.some((row) => this.subjectKey(row.responderIdentity) === requestedSubject)) {
        throw new ConflictException('该公司已有成员响应过此需求')
      }
    }

    const at = formatNow()
    /* 响应需审核：先落待审核（发布者不可见），管理员审核通过后才对发布者可见并进入「待处理」 */
    const needsReview = demand.respondNeedReview
    try {
      await this.prisma.demandRespondent.create({
        data: {
          demandId: demand.id,
          userId: uid,
          responderIdentity: responder.identity ?? Prisma.DbNull,
          name: responder.name,
          enterprise: responder.enterprise,
          phone: dto.phone?.trim() || responder.phone || null,
          email: dto.email?.trim() || responder.email || null,
          quote: dto.quote?.trim() || null,
          timeline: dto.timeline?.trim() || null,
          cases: dto.cases?.trim() || null,
          message: dto.note?.trim() || '响应需求',
          at,
          status: needsReview ? 'pending_review' : 'pending',
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('您已响应过该需求')
      }
      throw e
    }

    /* 需审核：响应积分与发布者通知都延后到管理员审核通过时（见后台 DemandsService.reviewRespondent），
     * 避免未过审即发分（刷分）与打扰发布者；驳回不发分、不通知发布者。 */
    if (needsReview) return { code: 0 }

    await this.points.issuePoints(uid, 'demand_responded', '响应需求获得积分', `demand_responded:${uid}:${demand.id}:${at}`)
    /* 后台代发需求的发布者可能是企业 ID：解析真实收件人后再发站内信 */
    const publisherUid = await this.noticeRecipient(demand.publisherId)
    if (publisherUid) {
      await this.notify.pushNotice(publisherUid, {
        type: 'demand',
        title: '收到新的需求响应',
        content: `您的需求「${demand.title}」收到新的响应，可在详情中查看并选择意向承接方。`,
        link: `/demands/${demand.id}`,
      })
    }
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
      ...(r.timeline != null ? { timeline: r.timeline } : {}),
      ...(r.cases != null ? { cases: r.cases } : {}),
      ...(r.phone != null ? { phone: r.phone } : {}),
      /* 审核驳回理由：随「我的响应」下发，供客户端展示驳回原因 */
      ...(r.rejectReason != null ? { rejectReason: r.rejectReason } : {}),
      ...(r.withdrawnAt != null ? { withdrawnAt: r.withdrawnAt } : {}),
    }))
  }

  /** 撤回本人响应（D-107）：需求仍为 published 且响应待处理时可撤回，撤回后视为未响应可重新响应。 */
  async withdrawResponse(uid: string, responseId: string): Promise<{ code: number }> {
    const id = Number.parseInt(responseId, 10)
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException('响应不存在或已撤回')
    const response = await this.prisma.demandRespondent.findFirst({
      where: { id, userId: uid, withdrawnAt: null },
    })
    if (!response) throw new NotFoundException('响应不存在或已撤回')
    const demand = await this.prisma.demand.findUnique({ where: { id: response.demandId } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'published') throw new ConflictException('需求已进入立项流程，响应不可撤回')
    if (response.status !== 'pending' && response.status !== 'pending_review') {
      throw new ConflictException('该响应已被处理，不可撤回')
    }
    /* 状态条件更新抢占：与审核（后台 reviewRespondent）并发时只有一方生效，避免审核后仍被撤回 */
    const withdrawn = await this.prisma.demandRespondent.updateMany({
      where: { id, userId: uid, withdrawnAt: null, status: { in: ['pending', 'pending_review'] } },
      data: { withdrawnAt: formatNow(), status: 'closed' },
    })
    if (withdrawn.count !== 1) throw new ConflictException('该响应已被处理，不可撤回')
    return { code: 0 }
  }

  /** 需求发布者查看响应列表（非发布者 403） */
  async demandResponses(uid: string, demandId: string) {
    const demand = await this.requireOwnDemand(uid, demandId)
    const rows = await this.prisma.demandRespondent.findMany({
      /* 待审核响应不对发布者可见；已撤回与审核驳回（已置 withdrawnAt 失效）同样不展示 */
      where: { demandId: demand.id, withdrawnAt: null, status: { not: 'pending_review' } },
      orderBy: { id: 'asc' },
    })
    return rows.map((r) => ({
      id: r.id,
      demandId: demand.id,
      demandTitle: demand.title,
      at: r.at,
      ...(r.userId != null ? { responderUid: r.userId } : {}),
      responderName: r.name,
      /* 响应补充信息：响应说明 / 联系手机 / 联系邮箱 / 报价 / 可投入时间 / 经验案例（供发布者评估）。
       * 响应审核通过时管理员可勾选「向需求方显示」：未勾选的字段（hiddenFields）在此逐项省略，发布者不可见。 */
      ...(respondentFieldVisible(r.hiddenFields, 'message') ? { note: r.message } : {}),
      ...(r.phone != null && respondentFieldVisible(r.hiddenFields, 'phone') ? { phone: r.phone } : {}),
      ...(r.email != null && respondentFieldVisible(r.hiddenFields, 'email') ? { email: r.email } : {}),
      ...(r.quote != null && respondentFieldVisible(r.hiddenFields, 'quote') ? { quote: r.quote } : {}),
      ...(r.timeline != null && respondentFieldVisible(r.hiddenFields, 'timeline') ? { timeline: r.timeline } : {}),
      ...(r.cases != null && respondentFieldVisible(r.hiddenFields, 'cases') ? { cases: r.cases } : {}),
      ...(r.responderIdentity != null ? { responderIdentity: this.identityType(r.responderIdentity) } : {}),
      status: r.status === 'pending' || r.status === 'accepted' || r.status === 'rejected' ? (r.status as 'pending' | 'accepted' | 'rejected') : undefined,
      ...(r.reviewAt != null ? { reviewedAt: r.reviewAt } : {}),
      ...(r.rejectReason != null ? { rejectReason: r.rejectReason } : {}),
      ...(r.withdrawnAt != null ? { withdrawnAt: r.withdrawnAt } : {}),
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
    if (responses.some((r) => r.status === 'pending_review')) {
      throw new ConflictException('该响应待管理员审核，暂不可选择')
    }

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
    await this.assertCategoryCode(dto)
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

  /* ---------- 内部工具 ---------- */

  /** 需求广场开关（关闭后提交与响应同时暂停） */
  private async assertDemandOpen(action: '发布' | '响应' = '发布'): Promise<void> {
    const cfg = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (cfg && cfg.demandOpen === false) {
      throw new BadRequestException(action === '响应' ? '需求响应暂未开放' : '需求发布暂未开放')
    }
  }

  /** 站内信收件人解析：用户本人；企业 ID 落到企业联系人；无法解析返回 null（不阻断主流程） */
  private async noticeRecipient(subjectId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { uid: subjectId }, select: { uid: true } })
    if (user) return user.uid
    const enterprise = await this.prisma.enterprise.findUnique({
      where: { id: subjectId },
      select: { contactUserId: true },
    })
    if (!enterprise?.contactUserId) return null
    const contact = await this.prisma.user.findUnique({ where: { uid: enterprise.contactUserId }, select: { uid: true } })
    return contact?.uid ?? null
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

  /** 类目编码按字典校验（demand_category / industry）：非法编码返回 400，避免写入无法映射类目标签的数据 */
  private async assertCategoryCode(dto: CreateDemandDto): Promise<void> {
    const entry = await this.prisma.dictEntry.findFirst({
      where: { type: dto.categoryDict, code: dto.categoryCode },
      select: { code: true },
    })
    if (!entry) throw new BadRequestException(dto.kind === 'investment' ? '请选择有效的所属行业' : '请选择有效的需求类别')
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
    if (asIdentity === 'community_individual') {
      if (!identities.some((i) => i.type === 'community_individual')) throw new BadRequestException('您暂未关联该身份')
      return { name: user.nickname, identity: { type: 'community_individual', level: null } }
    }
    if (asIdentity === 'external_enterprise') {
      const ext = identities.find((i) => i.type === 'external_enterprise')
      if (!ext) throw new BadRequestException('您暂未关联该身份')
      return {
        name: ext.enterpriseName || user.nickname,
        identity: { type: 'external_enterprise', enterpriseName: ext.enterpriseName ?? null },
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

  /** 响应方主体快照（按所选身份解析；不再隐式代表首个社区企业） */
  private async resolveResponder(
    uid: string,
    user: User,
    dto: RespondDemandDto,
  ): Promise<{ name: string; enterprise: string; phone: string | null; email: string | null; identity: Prisma.InputJsonValue | null }> {
    const requested = dto.asIdentity ?? (dto.asEnterpriseId ? 'community_enterprise' : 'individual')

    if (requested === 'community_enterprise') {
      if (!dto.asEnterpriseId) throw new BadRequestException('请选择要代表的社区企业')
      await assertEnterprisePermission(this.prisma, uid, dto.asEnterpriseId, 'respond_demand')
      const ent = await this.prisma.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!ent) throw new BadRequestException('企业不存在')
      return {
        name: user.realName || user.nickname,
        enterprise: ent.name,
        phone: ent.contactPhone || user.phone,
        email: ent.contactEmail || user.email || null,
        identity: { type: 'community_enterprise', enterpriseId: ent.id, enterpriseName: ent.name, role: 'member' },
      }
    }

    if (requested === 'community_individual') {
      const row = await this.prisma.userIdentity.findFirst({ where: { userId: uid, type: 'community_individual' } })
      if (!row) throw new BadRequestException('您暂未关联该身份')
      return {
        name: user.realName || user.nickname,
        enterprise: '',
        phone: user.phone,
        email: user.email || null,
        identity: { type: 'community_individual', level: row.level ?? undefined },
      }
    }

    if (requested === 'external_enterprise') {
      const row = await this.prisma.userIdentity.findFirst({ where: { userId: uid, type: 'external_enterprise' } })
      if (!row) throw new BadRequestException('您暂未关联该身份')
      return {
        name: user.realName || user.nickname,
        enterprise: row.enterpriseName || '',
        phone: user.phone,
        email: user.email || null,
        identity: { type: 'external_enterprise', organizationName: row.enterpriseName ?? undefined, title: '合作企业' },
      }
    }

    return {
      name: user.realName || user.nickname,
      enterprise: '',
      phone: user.phone,
      email: user.email || null,
      identity: { type: 'individual', title: '个人用户' },
    }
  }

  /** 响应主体 key（身份类型 + 公司/组织）：用于「换身份重复响应」与「同企业二次响应」判定 */
  private subjectKey(identity: unknown): string {
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return ''
    const obj = identity as Record<string, unknown>
    const scope = obj.enterpriseId ?? obj.organizationName ?? ''
    return `${String(obj.type ?? '')}:${String(scope)}`
  }

  /* ---------- 可见范围 SQL 条件 ---------- */

  /** 可见范围 SQL 条件：按「单个身份」联合判定（类型命中且等级命中），多个身份取并集；两组都为空 = 不限 */
  private visibilityCond(identities: IdentitySummary[]): Prisma.DemandWhereInput {
    if (identities.length === 0) {
      return { visibilityIdentities: { isEmpty: true }, visibilityLevels: { isEmpty: true } }
    }
    const branches: Prisma.DemandWhereInput[] = identities.map((i) => {
      const typeCond: Prisma.DemandWhereInput = {
        OR: [{ visibilityIdentities: { isEmpty: true } }, { visibilityIdentities: { has: i.type } }],
      }
      const levelCond: Prisma.DemandWhereInput =
        i.level != null
          ? { OR: [{ visibilityLevels: { isEmpty: true } }, { visibilityLevels: { has: String(i.level) } }] }
          : { visibilityLevels: { isEmpty: true } }
      return { AND: [typeCond, levelCond] }
    })
    return { OR: branches }
  }

  /** 单条详情可见性校验：与列表一致，按「单个身份」联合判定，多个身份取并集 */
  private visibly(identities: IdentitySummary[], demand: Demand): boolean {
    if (demand.visibilityIdentities.length === 0 && demand.visibilityLevels.length === 0) return true
    return identities.some(
      (i) =>
        (demand.visibilityIdentities.length === 0 || demand.visibilityIdentities.includes(i.type)) &&
        (demand.visibilityLevels.length === 0 || (i.level != null && demand.visibilityLevels.includes(String(i.level)))),
    )
  }

  /** 分页响应数（排除已撤回/已驳回失效记录与待审核响应；与「发布者可见响应」口径一致） */
  private async responseCounts(demandIds: string[]): Promise<Map<string, number>> {
    if (demandIds.length === 0) return new Map()
    const rows = await this.prisma.demandRespondent.groupBy({
      by: ['demandId'],
      where: { demandId: { in: demandIds }, withdrawnAt: null, status: { not: 'pending_review' } },
      _count: { demandId: true },
    })
    return new Map(rows.map((r) => [r.demandId, r._count.demandId]))
  }

  /** 类目参数（编码或标签）→ 编码和标签；兼容历史直接保存标签的需求。 */
  private async resolveCategoryValues(input: string): Promise<string[] | null> {
    if (!input) return null
    const candidates = await this.prisma.dictEntry.findMany({
      where: { type: { in: ['demand_category', 'industry'] } },
      select: { code: true, label: true },
    })
    const hit = candidates.find((c) => c.code === input || c.label === input)
    return hit ? [hit.code, hit.label] : null
  }

  /** 需求库保存字典 code；对 App 契约统一下发人可读标签，并兼容历史直接保存标签的数据。 */
  private async toListItems(demands: Demand[], counts: Map<string, number>) {
    const codes = [...new Set(demands.map((d) => d.category).filter(Boolean))]
    const entries = codes.length
      ? await this.prisma.dictEntry.findMany({
          where: { code: { in: codes }, type: { in: ['demand_category', 'industry'] } },
          select: { code: true, label: true },
        })
      : []
    const labels = new Map(entries.map((entry) => [entry.code, entry.label]))
    return demands.map((demand) => this.toListItem(demand, counts.get(demand.id) ?? 0, labels))
  }

  /** 列表/详情条目：联系人仅在需求开启「公开联系人」时下发（含未登录游客），否则一律不下发 */
  private toListItem(demand: Demand, responseCount: number, categoryLabels = new Map<string, string>()) {
    const officialLabel = this.officialIdentityLabel(demand.publisherIdentity)
    return {
      id: demand.id,
      title: demand.title,
      description: demand.description,
      categoryLabel: categoryLabels.get(demand.category) ?? demand.category,
      status: demand.status,
      kind: (demand.demandType ?? 'task') as 'task' | 'investment' | 'cooperation',
      publisherUid: demand.publisherId,
      publisherName: demand.publisherName,
      publisherIdentity: this.identityType(demand.publisherIdentity),
      ...(officialLabel ? { publisherIdentityLabel: officialLabel } : {}),
      responseCount,
      /* 响应需审核：客户端据此提示「提交后待管理员审核」 */
      respondNeedReview: demand.respondNeedReview,
      ...(demand.contactPublic
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

  /** 社区自建需求（type=official）的角色名标签；其余身份返回 undefined 由客户端按 type 映射文案 */
  private officialIdentityLabel(json: Prisma.JsonValue | null | undefined): string | undefined {
    if (!json || typeof json !== 'object') return undefined
    const v = json as Record<string, unknown>
    if (v.type !== 'official') return undefined
    const title = typeof v.title === 'string' ? v.title.trim() : ''
    return title || '社区官方'
  }

  /** 持有社区个体身份时默认社区个体，否则 individual */
  private defaultIdentity(identities: Array<{ type: string }>): string {
    const types = identities.map((i) => i.type)
    return types.includes('community_individual') ? 'community_individual' : 'individual'
  }

  /** @Public 浏览端点：读可选登录态（与 AppJwtGuard 同口径，失败按游客处理） */
  private async optionalUid(req: Request): Promise<string | null> {
    const uid = await resolveOptionalAppUid(this.auth, req.headers.authorization ?? undefined)
    return uid ?? null
  }

  private toNum(id: string): number {
    const n = Number.parseInt(id, 10)
    return Number.isNaN(n) ? -1 : n
  }
}
