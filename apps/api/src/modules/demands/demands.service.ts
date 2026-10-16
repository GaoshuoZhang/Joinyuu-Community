import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Demand, DemandRespondent } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { NotificationService } from '../../common/notify/notification.service'
import { formatNow } from '../../common/utils/time'
import { normalizeScheduledAt } from '../../common/utils/schedule-time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import { ProjectsService } from '../projects/projects.service'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import type { QueryDemandsDto } from './dto/query-demands.dto'
import type { QueryDemandResponsesDto } from './dto/query-demand-responses.dto'
import type { CreateDemandDto } from './dto/create-demand.dto'
import type { UpdateDemandDto } from './dto/update-demand.dto'
import type { RejectDemandDto } from './dto/reject-demand.dto'
import type { ScheduleDemandDto } from './dto/schedule-demand.dto'
import type { ProxyRespondDemandDto } from './dto/proxy-respond-demand.dto'
import type { ReviewRespondentDto } from './dto/review-respondent.dto'
import type { InitiateProjectDto } from './dto/initiate-project.dto'

type DemandWithRespondents = Demand & { respondents: DemandRespondent[] }

type DemandRow = Omit<DemandWithRespondents, 'respondents'>

export interface RespondentDto {
  /** 响应记录编号（响应审核定位、列表稳定行键） */
  id: number
  name: string
  enterprise: string
  phone?: string
  email?: string
  quote?: string
  /** 可投入时间/预计工期（响应表单新增字段） */
  timeline?: string
  /** 相关经验与案例 */
  cases?: string
  message: string
  at: string
  status: string
  /** 审核时间（响应审核通过/驳回时写入） */
  reviewedAt?: string
  /** 驳回理由（status = rejected 时存在） */
  rejectReason?: string
}

/** 后台自建需求的提交人来源：当前登录工作人员（账号名 + 姓名） */
export interface DemandOperator {
  /** 管理员账号名（写入 publisherId） */
  username: string
  /** 管理员姓名（写入 publisherName） */
  name: string
}

export interface DemandDto {
  id: string
  title: string
  category: string
  /** 类别展示名称；category 保留字典 code，兼容历史直接保存名称的数据。 */
  categoryLabel: string
  demandType: string
  deliverable?: string
  deliverBy?: string
  cooperationNeed?: string
  returnOffer?: string
  bottleneck?: string
  partnershipMode?: string
  publisherId: string
  publisherName: string
  publisherIdentity: unknown
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  /** 公开联系人：true 时客户端（含未登录游客）可见联系人信息 */
  contactPublic: boolean
  /** 响应需审核：true 时客户端提交的响应先进入待审核，管理员审核通过才对发布者可见 */
  respondNeedReview: boolean
  budget: string
  period: string
  deadline: string
  scheduledAt?: string
  visibilityIdentities: string[]
  visibilityLevels: string[]
  enrollmentIdentities: string[]
  enrollmentLevels: string[]
  status: string
  createdAt: string
  publishedAt?: string
  description: string
  tags: string[]
  rejectedReason?: string
  matchedRespondent?: string
  projectId?: string
  respondPoints?: number
  /** 总响应数（未撤回；已驳回视为失效不计入） */
  responseCount: number
  /** 待审核响应数（未撤回且 status = pending_review） */
  pendingResponseCount: number
  deletedAt?: string
  respondents: RespondentDto[]
}

/** 响应审核列表项（「业务运营 → 响应审核」）：待审核响应 + 所属需求摘要 */
export interface PendingRespondentDto {
  id: number
  demandId: string
  demandTitle: string
  demandStatus: string
  publisherName: string
  name: string
  enterprise: string
  /** 响应者身份快照（type/enterpriseName 等），列表用于身份标签 */
  responderIdentity?: Prisma.JsonValue
  quote?: string
  timeline?: string
  cases?: string
  message: string
  phone?: string
  email?: string
  at: string
  status: string
}

export interface UndertakerOptionDto {
  group: string
  label: string
  value: string
}

export interface PublisherOptionsDto {
  users: Array<{
    uid: string
    nickname: string
    realName: string
    phone: string
    email: string
    tag: '社区个体' | '个人用户'
  }>
  enterprises: Array<{
    id: string
    name: string
    contactName: string
    contactPhone: string
    contactEmail?: string
    tag: '社区企业' | '合作企业'
  }>
}

function toRespondentDto(r: DemandRespondent): RespondentDto {
  const dto: RespondentDto = {
    id: r.id,
    name: r.name,
    enterprise: r.enterprise,
    message: r.message,
    at: r.at,
    status: r.status,
  }
  if (r.phone != null) dto.phone = r.phone
  if (r.email != null) dto.email = r.email
  if (r.quote != null) dto.quote = r.quote
  if (r.timeline != null) dto.timeline = r.timeline
  if (r.cases != null) dto.cases = r.cases
  if (r.reviewAt != null) dto.reviewedAt = r.reviewAt
  if (r.rejectReason != null) dto.rejectReason = r.rejectReason
  return dto
}

/* Prisma 行 → Demand 形状：publisherIdentity Json 透传、可选字段缺失时省略（对齐 undefined） */
function toDemandDto(d: DemandWithRespondents): DemandDto {
  /* 有效响应 = 未撤回（驳回在响应审核时已置 withdrawnAt 失效，允许响应者重新响应） */
  const active = d.respondents.filter((r) => r.withdrawnAt == null)
  const dto: DemandDto = {
    id: d.id,
    title: d.title,
    category: d.category,
    categoryLabel: d.category,
    demandType: d.demandType,
    publisherId: d.publisherId,
    publisherName: d.publisherName,
    publisherIdentity: d.publisherIdentity,
    contactPublic: d.contactPublic,
    respondNeedReview: d.respondNeedReview,
    budget: d.budget,
    period: d.period,
    deadline: d.deadline,
    visibilityIdentities: d.visibilityIdentities,
    visibilityLevels: d.visibilityLevels,
    enrollmentIdentities: d.enrollmentIdentities,
    enrollmentLevels: d.enrollmentLevels,
    status: d.status,
    createdAt: d.createdAt,
    description: d.description,
    tags: d.tags,
    respondents: d.respondents.map(toRespondentDto),
    responseCount: active.length,
    pendingResponseCount: active.filter((r) => r.status === 'pending_review').length,
  }
  if (d.deliverable != null) dto.deliverable = d.deliverable
  if (d.deliverBy != null) dto.deliverBy = d.deliverBy
  if (d.cooperationNeed != null) dto.cooperationNeed = d.cooperationNeed
  if (d.returnOffer != null) dto.returnOffer = d.returnOffer
  if (d.bottleneck != null) dto.bottleneck = d.bottleneck
  if (d.partnershipMode != null) dto.partnershipMode = d.partnershipMode
  if (d.contactName != null) dto.contactName = d.contactName
  if (d.contactPhone != null) dto.contactPhone = d.contactPhone
  if (d.contactEmail != null) dto.contactEmail = d.contactEmail
  if (d.scheduledAt != null) dto.scheduledAt = d.scheduledAt
  if (d.publishedAt != null) dto.publishedAt = d.publishedAt
  if (d.deletedAt != null) dto.deletedAt = d.deletedAt
  if (d.rejectedReason != null) dto.rejectedReason = d.rejectedReason
  if (d.matchedRespondent != null) dto.matchedRespondent = d.matchedRespondent
  if (d.projectId != null) dto.projectId = d.projectId
  if (d.respondPoints != null) dto.respondPoints = d.respondPoints
  return dto
}

/* 需求域（wiki-backend.md §7.6/§8.1/§8.7）：
 * 状态机 pending → pending_release → published|scheduled → projected/closed/rejected 等服务端 409 强制；
 * 发布方身份快照 resolveStaffPublisher 服务端化（后台自建需求提交人=当前工作人员）；代报名写 DemandRespondent；
 * 立项复用 ProjectsService.createProject 后双向关联 demand.projectId ↔ project.sourceDemandId。 */
@Injectable()
export class DemandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly projects: ProjectsService,
    private readonly notify: NotificationService,
    private readonly points: PointsEngineService,
  ) {}

  async findAll(query: QueryDemandsDto): Promise<{ list: DemandDto[]; total: number }> {
    const where: Prisma.DemandWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.category) {
      const entry = await this.prisma.dictEntry.findFirst({
        where: {
          type: { in: ['demand_category', 'industry'] },
          OR: [{ code: query.category }, { label: query.category }],
        },
        select: { code: true, label: true },
      })
      where.category = entry ? { in: [entry.code, entry.label] } : query.category
    }
    if (query.demandType) where.demandType = query.demandType
    if (query.status) where.status = query.status
    if (query.publisherId) where.publisherId = query.publisherId

    /* 企业筛选下沉数据库：社区企业按身份快照 enterpriseId；合作企业按档案名匹配快照 enterpriseName（档案不存在则空集） */
    if (query.enterprise) {
      const community = await this.prisma.enterprise.findUnique({ where: { id: query.enterprise } })
      if (community) {
        where.publisherIdentity = { path: ['enterpriseId'], equals: query.enterprise }
      } else {
        const profile = await this.prisma.externalEnterpriseProfile.findUnique({
          where: { id: query.enterprise },
        })
        if (!profile) return { list: [], total: 0 }
        where.publisherIdentity = { path: ['enterpriseName'], equals: profile.name }
      }
    }

    /* 排序：默认 createdAt 倒序；publishedAt 空值排最后（双向）；id 按编号数值比较——三者与计数、分页一并下发数据库 */
    const desc = query.sortOrder !== 'ascend'
    const field = query.sortBy ?? 'createdAt'
    const offset = (query.page - 1) * query.pageSize

    let rows: DemandRow[]
    let total: number
    if (field === 'id') {
      /* Prisma orderBy 只能按字符串比较编号（D9/D10 会错序），故保留数值序：
       * 仅取编号列在库内过滤后内存定位当页编号，再按编号批量取当页行，避免整行全表载入 */
      const dir = desc ? -1 : 1
      const [idRows, count] = await Promise.all([
        this.prisma.demand.findMany({ where, select: { id: true } }),
        this.prisma.demand.count({ where }),
      ])
      const pageIds = idRows
        .map((r) => r.id)
        .sort((a, b) => {
          const av = Number(a.replace('D', ''))
          const bv = Number(b.replace('D', ''))
          return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
        })
        .slice(offset, offset + query.pageSize)
      rows = pageIds.length
        ? await this.prisma.demand.findMany({ where: { id: { in: pageIds } } })
        : []
      const pos = new Map(pageIds.map((id, index) => [id, index]))
      rows.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
      total = count
    } else {
      const orderBy: Prisma.DemandOrderByWithRelationInput = field === 'publishedAt'
        ? { publishedAt: { sort: desc ? 'desc' : 'asc', nulls: 'last' } }
        : { createdAt: desc ? 'desc' : 'asc' }
      const [list, count] = await Promise.all([
        this.prisma.demand.findMany({ where, orderBy, skip: offset, take: query.pageSize }),
        this.prisma.demand.count({ where }),
      ])
      rows = list
      total = count
    }

    /* 仅当页批量补取响应记录（替代全量 include，随分页收缩载入量） */
    const respondents = rows.length
      ? await this.prisma.demandRespondent.findMany({
          where: { demandId: { in: rows.map((d) => d.id) } },
          orderBy: { id: 'asc' },
        })
      : []
    const byDemand = new Map<string, DemandRespondent[]>()
    for (const r of respondents) {
      const arr = byDemand.get(r.demandId) ?? []
      arr.push(r)
      byDemand.set(r.demandId, arr)
    }

    const demandDtos = rows.map((d) => toDemandDto({ ...d, respondents: byDemand.get(d.id) ?? [] }))
    return { list: await this.withCategoryLabels(demandDtos), total }
  }

  async findOne(id: string): Promise<DemandDto> {
    const demand = await this.prisma.demand.findUnique({
      where: { id },
      include: { respondents: { orderBy: { id: 'asc' } } },
    })
    if (!demand) throw new NotFoundException('需求不存在')
    return (await this.withCategoryLabels([toDemandDto(demand)]))[0]
  }

  async create(dto: CreateDemandDto, operator: DemandOperator): Promise<DemandDto> {
    const publisher = await this.resolveStaffPublisher(operator)

    const id = await this.ids.next('D')
    const demand = await this.prisma.demand.create({
      data: {
        ...this.editableData(dto),
        id,
        publisherId: publisher.id,
        publisherName: publisher.name,
        publisherIdentity: publisher.identity,
        status: 'pending_release',
        createdAt: formatNow(),
        tags: [],
      },
      include: { respondents: true },
    })

    await this.audit.record({
      module: '需求管理',
      action: '新增需求',
      target: `${demand.id} · ${demand.title}`,
      detail: `提交人：${demand.publisherName}`,
      after: { status: demand.status },
      operator: operator.name,
    })

    return (await this.withCategoryLabels([toDemandDto(demand)]))[0]
  }

  async update(id: string, dto: UpdateDemandDto, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'pending_release' && demand.status !== 'published') {
      throw new ConflictException('仅待发布/已发布的需求可编辑')
    }

    await this.prisma.demand.update({ where: { id }, data: this.editableData(dto) })

    await this.audit.record({
      module: '需求管理',
      action: '编辑需求',
      target: `${demand.id} · ${demand.title}`,
      operator,
    })
    return { code: 0 }
  }

  async approve(id: string, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'pending') throw new ConflictException('仅待审核的需求可审核')

    await this.prisma.demand.update({ where: { id }, data: { status: 'pending_release' } })

    await this.audit.record({
      module: '需求管理',
      action: '需求审核通过',
      target: `${demand.id} · ${demand.title}`,
      before: { status: demand.status },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  async reject(id: string, dto: RejectDemandDto, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'pending') throw new ConflictException('仅待审核的需求可驳回')
    const reason = (dto.reason ?? '').trim()
    if (!reason) throw new BadRequestException('请填写驳回原因')

    await this.prisma.demand.update({
      where: { id },
      data: { status: 'rejected', rejectedReason: reason, archivableAt: formatNow() },
    })
    const publisherUserId = await this.notifiableUser(demand.publisherId)
    if (publisherUserId) {
      await this.notify.pushNotice(publisherUserId, {
        type: 'demand',
        title: '需求未通过审核',
        content: `您的需求「${demand.title}」未通过审核：${reason}`,
        link: '/me/demands',
      })
    }
    await this.audit.record({
      module: '需求管理',
      action: '需求驳回',
      target: `${demand.id} · ${demand.title}`,
      detail: reason,
      before: { status: demand.status },
      after: { status: 'rejected', rejectedReason: reason },
      operator,
    })
    return { code: 0 }
  }

  async archive(id: string, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findFirst({ where: { id, deletedAt: null } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'rejected' && demand.status !== 'closed' && demand.status !== 'projected') {
      throw new ConflictException('仅已驳回、已关闭或已立项的需求可归档')
    }

    await this.prisma.demand.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })

    await this.audit.record({
      module: '需求管理',
      action: '归档需求',
      target: `${demand.id} · ${demand.title}`,
      before: { status: demand.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  async publishNow(id: string, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'pending_release') throw new ConflictException('仅待发布的需求可立即发布')

    await this.prisma.demand.update({
      where: { id },
      data: { status: 'published', scheduledAt: null, publishedAt: formatNow() },
    })
    await this.points.issuePoints(demand.publisherId, 'demand_published', '需求审核通过并发布', `demand_published:${demand.id}`)

    await this.audit.record({
      module: '需求管理',
      action: '需求发布',
      target: `${demand.id} · ${demand.title}`,
      before: { status: demand.status },
      after: { status: 'published' },
      operator,
    })
    return { code: 0 }
  }

  async schedule(id: string, dto: ScheduleDemandDto, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'pending_release') throw new ConflictException('仅待发布的需求可设定时发布')
    /* 格式校验 + 归一化 + 必须晚于当前时间（避免非法/过去值被调度任务判定为立即发布） */
    const scheduledAt = normalizeScheduledAt(dto.scheduledAt)

    await this.prisma.demand.update({
      where: { id },
      data: { status: 'scheduled', scheduledAt },
    })

    await this.audit.record({
      module: '需求管理',
      action: '需求定时发布',
      target: `${demand.id} · ${demand.title}`,
      detail: `定时时间 ${scheduledAt}`,
      before: { status: demand.status },
      after: { status: 'scheduled', scheduledAt },
      operator,
    })
    return { code: 0 }
  }

  async cancelSchedule(id: string, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'scheduled') throw new ConflictException('仅定时发布中的需求可取消定时')

    await this.prisma.demand.update({
      where: { id },
      data: { status: 'pending_release', scheduledAt: null, publishedAt: null },
    })

    await this.audit.record({
      module: '需求管理',
      action: '取消定时发布',
      target: `${demand.id} · ${demand.title}`,
      before: { status: demand.status },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  async retract(id: string, operator: string, takedownReason?: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand || demand.deletedAt) throw new NotFoundException('需求不存在')
    if (demand.status !== 'published') throw new ConflictException('仅已发布的需求可撤回发布')

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.demand.updateMany({
        where: { id, deletedAt: null, status: 'published' },
        data: { status: 'pending_release', scheduledAt: null, publishedAt: null },
      })
      if (changed.count !== 1) throw new ConflictException('需求状态已变化，请刷新后重试')
      await this.notify.notifyContentTakedown(tx, 'demand', id, takedownReason)
    })

    await this.audit.record({
      module: '需求管理',
      action: '撤回发布',
      target: `${demand.id} · ${demand.title}`,
      detail: takedownReason?.trim() || undefined,
      before: { status: demand.status, publishedAt: demand.publishedAt },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  async close(id: string, operator: string): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'pending_release' && demand.status !== 'published') {
      throw new ConflictException('仅待发布/已发布的需求可关闭')
    }

    await this.prisma.demand.update({
      where: { id },
      data: { status: 'closed', archivableAt: formatNow() },
    })

    await this.audit.record({
      module: '需求管理',
      action: '需求关闭',
      target: `${demand.id} · ${demand.title}`,
      before: { status: demand.status },
      after: { status: 'closed' },
      operator,
    })
    return { code: 0 }
  }

  async proxyRespond(id: string, dto: ProxyRespondDemandDto): Promise<{ code: number }> {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'published' && demand.status !== 'projected') {
      throw new ConflictException('仅已发布/已立项的需求可代报名')
    }
    const phone = dto.phone.trim()
    if (!phone) throw new BadRequestException('请填写联系电话')

    await this.prisma.demandRespondent.create({
      data: {
        demandId: id,
        name: dto.userName.trim(),
        enterprise: dto.enterprise.trim(),
        phone,
        email: (dto.email ?? '').trim() || null,
        quote: (dto.quote ?? '').trim() || null,
        message: (dto.message ?? '').trim() || '管理员代报名',
        at: formatNow(),
        status: 'pending',
      },
    })
    return { code: 0 }
  }

  /** 响应审核列表项（「业务运营 → 响应审核」）：待审核响应 + 所属需求摘要，供运营集中审核 */
  async findPendingRespondents(
    query: QueryDemandResponsesDto,
  ): Promise<{ list: PendingRespondentDto[]; total: number }> {
    const where: Prisma.DemandRespondentWhereInput = { status: 'pending_review', withdrawnAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { name: { contains: kw, mode: 'insensitive' } },
        { enterprise: { contains: kw, mode: 'insensitive' } },
        { message: { contains: kw, mode: 'insensitive' } },
        { demandId: { contains: kw, mode: 'insensitive' } },
      ]
    }
    const [rows, total] = await Promise.all([
      this.prisma.demandRespondent.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { demand: { select: { id: true, title: true, status: true, publisherName: true } } },
      }),
      this.prisma.demandRespondent.count({ where }),
    ])
    return {
      list: rows.map((r) => {
        const dto: PendingRespondentDto = {
          id: r.id,
          demandId: r.demandId,
          demandTitle: r.demand.title,
          demandStatus: r.demand.status,
          publisherName: r.demand.publisherName,
          name: r.name,
          enterprise: r.enterprise,
          message: r.message,
          at: r.at,
          status: r.status,
        }
        if (r.responderIdentity != null) dto.responderIdentity = r.responderIdentity
        if (r.quote != null) dto.quote = r.quote
        if (r.timeline != null) dto.timeline = r.timeline
        if (r.cases != null) dto.cases = r.cases
        if (r.phone != null) dto.phone = r.phone
        if (r.email != null) dto.email = r.email
        return dto
      }),
      total,
    }
  }

  /* 响应审核：待审核（pending_review）→ 通过回到「待处理」（仍由发布者选定承接方，此时才发响应积分并通知发布者）；
   * 驳回写理由并置为失效（withdrawnAt），响应者可重新响应。状态条件抢占，防并发/重复审核。 */
  async reviewRespondent(
    demandId: string,
    respondentId: string,
    dto: ReviewRespondentDto,
    operator: string,
  ): Promise<{ code: number }> {
    const id = Number.parseInt(respondentId, 10)
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException('响应不存在')
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId } })
    if (!demand) throw new NotFoundException('需求不存在')
    const respondent = await this.prisma.demandRespondent.findUnique({ where: { id } })
    if (!respondent || respondent.demandId !== demand.id) throw new NotFoundException('响应不存在')

    const approved = dto.status === 'approved'
    const reason = (dto.reason ?? '').trim()
    if (!approved && !reason) throw new BadRequestException('请填写驳回原因')

    const now = formatNow()
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.demandRespondent.updateMany({
        where: { id, demandId: demand.id, status: 'pending_review', withdrawnAt: null },
        data: approved
          ? { status: 'pending', reviewAt: now }
          : { status: 'rejected', reviewAt: now, rejectReason: reason, withdrawnAt: now },
      })
      if (claimed.count !== 1) throw new ConflictException('该响应已处理，请勿重复审核')

      if (!approved) {
        /* 驳回：不发积分，仅通知响应者（含驳回理由）；记录已置失效，允许重新响应 */
        if (respondent.userId) {
          await this.notify.pushNoticeInTransaction(tx, respondent.userId, {
            type: 'demand',
            title: '响应未通过审核',
            content: `您对需求「${demand.title}」的响应未通过审核：${reason}`,
            link: '/me/responses',
          })
        }
        return
      }

      /* 通过：响应积分与发布者通知都延后到此刻（提交时不发分、不通知，防刷分、防打扰） */
      if (respondent.userId) {
        await this.points.issuePointsInTransaction(
          tx,
          respondent.userId,
          'demand_responded',
          '响应需求获得积分',
          `demand_responded:${respondent.userId}:${demand.id}:${respondent.id}`,
        )
      }
      const publisherUserId = await this.resolveNotifiableUser(tx, demand.publisherId)
      if (publisherUserId) {
        await this.notify.pushNoticeInTransaction(tx, publisherUserId, {
          type: 'demand',
          title: '收到新的需求响应',
          content: `您的需求「${demand.title}」有新的响应通过审核，可在详情中查看并选择意向承接方。`,
          link: `/demands/${demand.id}`,
        })
      }
    })

    await this.audit.record({
      module: '需求管理',
      action: approved ? '响应审核通过' : '响应审核驳回',
      target: `${demand.id} · ${demand.title}`,
      detail: `响应人：${respondent.name}${approved ? '' : `；理由：${reason}`}`,
      before: { status: respondent.status },
      after: approved ? { status: 'pending' } : { status: 'rejected', rejectReason: reason },
      operator,
    })
    return { code: 0 }
  }

  /* 立项：published|selected → projected；项目新增与双向关联（demand.projectId ↔ project.sourceDemandId）置于同一事务；
   * 发布者已选定承接方（selected）时，向被选中的响应者补发立项积分/经验并通知。 */
  async initiateProject(id: string, dto: InitiateProjectDto, operator: string) {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    if (demand.status !== 'published' && demand.status !== 'selected') {
      throw new ConflictException('仅已发布或已选定承接方的需求可立项')
    }

    const selected = demand.status === 'selected'
      ? await this.prisma.demandRespondent.findMany({
          where: { demandId: demand.id, status: 'accepted', withdrawnAt: null },
        })
      : []

    const project = await this.prisma.$transaction(async (tx) => {
      /* 条件抢占：仅当需求仍为 published/selected 且未立项时才准予立项，避免并发重复立项 */
      const claim = await tx.demand.updateMany({
        where: { id: demand.id, deletedAt: null, status: { in: ['published', 'selected'] }, projectId: null },
        data: { status: 'projected', archivableAt: formatNow() },
      })
      if (claim.count !== 1) throw new ConflictException('该需求已立项或被处理')

      /* 需求立项：项目需求方/创建人/联系方式/合同价格一律照搬需求快照（客户端传值不生效），
       * 保证项目详情可追溯需求方，且需求发布方（含企业联系人）可访问项目。
       * 需求已无独立「创建人」字段，项目的创建人取需求提交人（发布方）。 */
      const created = await this.projects.createProjectInHostTx(tx, {
        ...dto,
        demanderId: demand.publisherId,
        demanderName: demand.publisherName,
        demanderIdentity: (demand.publisherIdentity ?? null) as Prisma.InputJsonValue | null,
        creatorName: demand.publisherName,
        creatorId: demand.publisherId,
        contactName: demand.contactName ?? undefined,
        contactPhone: demand.contactPhone ?? undefined,
        contactEmail: demand.contactEmail ?? undefined,
        contractPrice: demand.budget,
      })
      await tx.project.update({ where: { id: created.id }, data: { sourceDemandId: demand.id } })
      await tx.demand.update({ where: { id: demand.id }, data: { projectId: created.id } })

      /* 立项奖励：发起方 + 被选中的承接方（与需求承接规则一致，幂等键按需求维度去重） */
      await this.points.issuePointsInTransaction(tx, demand.publisherId, 'demand_undertaken', '需求立项获得积分', `demand_undertaken:${demand.publisherId}:${demand.id}`)
      /* 后台代发需求的发布者可能是企业 ID，站内信仅发给真实用户 */
      const publisherUserId = await this.resolveNotifiableUser(tx, demand.publisherId)
      if (publisherUserId) {
        await this.notify.pushNoticeInTransaction(tx, publisherUserId, {
          type: 'demand',
          title: '需求已达成合作',
          content: `您的需求「${demand.title}」已立项，协作项目已生成。`,
          link: `/me/projects/${created.id}`,
        })
      }
      for (const response of selected) {
        if (response.userId) {
          await this.points.issuePointsInTransaction(tx, response.userId, 'demand_undertaken', '承接需求立项获得积分', `demand_undertaken:${response.userId}:${demand.id}`)
          await this.notify.pushNoticeInTransaction(tx, response.userId, {
            type: 'demand',
            title: '承接成功',
            content: `您承接的需求「${demand.title}」已立项，协作项目已生成。`,
            link: `/me/projects/${created.id}`,
          })
        }
        const exp = this.respondentExperience(response)
        if (exp) await this.points.issueExperienceInTransaction(tx, exp.targetType, exp.targetId, 'project_undertaken', '承接需求立项获得项目经验')
      }
      return created
    })

    await this.audit.record({
      module: '需求管理',
      action: '需求立项',
      target: `${demand.id} · ${demand.title}`,
      detail: `生成项目 ${project.code}`,
      before: { status: demand.status },
      after: { status: 'projected', projectId: project.id },
      operator,
    })

    return { ...project, sourceDemandId: demand.id }
  }

  /** 站内信收件人：用户本人；企业 ID 落到企业联系人；无法解析时返回 null */
  private async resolveNotifiableUser(tx: Prisma.TransactionClient, subjectId: string): Promise<string | null> {
    if (await tx.user.findUnique({ where: { uid: subjectId }, select: { uid: true } })) return subjectId
    const enterprise = await tx.enterprise.findUnique({ where: { id: subjectId }, select: { contactUserId: true } })
    return enterprise?.contactUserId ?? null
  }

  /** 同 resolveNotifiableUser 的非事务版本（用于单表写操作后的通知） */
  private async notifiableUser(subjectId: string): Promise<string | null> {
    return this.resolveNotifiableUser(this.prisma, subjectId)
  }

  /** 承接方项目经验投放目标（enterprise / individual） */
  private respondentExperience(response: DemandRespondent): { targetType: 'enterprise' | 'individual'; targetId: string } | null {
    const ri = response.responderIdentity as Record<string, unknown> | null
    if (ri?.type === 'community_enterprise' && ri.enterpriseId) return { targetType: 'enterprise', targetId: ri.enterpriseId as string }
    if (response.userId) return { targetType: 'individual', targetId: response.userId }
    return null
  }

  async undertakerOptions(): Promise<UndertakerOptionDto[]> {
    const [enterprises, externalProfiles, users] = await Promise.all([
      this.prisma.enterprise.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.externalEnterpriseProfile.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.user.findMany({ orderBy: { uid: 'asc' }, include: { identities: true } }),
    ])

    return [
      ...enterprises.map((e) => ({
        group: '社区企业',
        label: `${e.name}（社区企业 · ${e.id}）`,
        value: `enterprise:${e.id}`,
      })),
      ...externalProfiles.map((x) => ({
        group: '合作企业',
        label: `${x.name}（合作企业 · ${x.id}）`,
        value: `enterprise:${x.id}`,
      })),
      ...users.map((u) => {
        const tag = u.identities.some((i) => i.type === 'community_individual') ? '社区个体' : '个人用户'
        return { group: tag, label: `${u.nickname}（${tag} · ${u.uid}）`, value: `individual:${u.uid}` }
      }),
    ]
  }

  async publisherOptions(): Promise<PublisherOptionsDto> {
    const [users, enterprises, externalProfiles] = await Promise.all([
      this.prisma.user.findMany({ orderBy: { uid: 'asc' }, include: { identities: true } }),
      this.prisma.enterprise.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.externalEnterpriseProfile.findMany({ orderBy: { id: 'asc' } }),
    ])

    return {
      users: users.map((u) => ({
        uid: u.uid,
        nickname: u.nickname,
        realName: u.realName ?? u.nickname,
        phone: u.phone ?? '',
        email: u.email ?? '',
        tag: (u.identities.some((i) => i.type === 'community_individual')
          ? '社区个体'
          : '个人用户') as '社区个体' | '个人用户',
      })),
      enterprises: [
        ...enterprises.map((e) => ({
          id: e.id,
          name: e.name,
          contactName: e.contactName,
          contactPhone: e.contactPhone,
          contactEmail: e.contactEmail ?? undefined,
          tag: '社区企业' as const,
        })),
        ...externalProfiles.map((x) => ({
          id: x.id,
          name: x.name,
          contactName: '',
          contactPhone: '',
          contactEmail: undefined,
          tag: '合作企业' as const,
        })),
      ],
    }
  }

  /* 后台自建需求的提交人：一律取当前登录工作人员（账号名 + 姓名 + 角色名）。
   * 需求由社区自行创建，不存在客户端注册用户作为提交人，故不再提供人工选择提交人的入口。 */
  private async resolveStaffPublisher(
    operator: DemandOperator,
  ): Promise<{ id: string; name: string; identity: Prisma.InputJsonValue }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { username: operator.username },
      include: { roles: { include: { role: { select: { name: true, sort: true } } } } },
    })
    const roleNames = (admin?.roles ?? [])
      .slice()
      .sort((a, b) => a.role.sort - b.role.sort)
      .map((link) => link.role.name)
    return {
      /* publisherId 存管理员账号名（非 U/E/XE 前缀，后台列表不渲染为可跳转主体） */
      id: operator.username.slice(0, 16),
      name: admin?.name || operator.name || '社区管理员',
      identity: { type: 'official', title: roleNames.join('、') || '社区管理员' },
    }
  }

  /** 类别字段保存字典 code；响应同时附带标签，已删除或历史直接保存标签时安全回退原值。 */
  private async withCategoryLabels(demands: DemandDto[]): Promise<DemandDto[]> {
    const codes = [...new Set(demands.map((demand) => demand.category).filter(Boolean))]
    if (!codes.length) return demands
    const entries = await this.prisma.dictEntry.findMany({
      where: { code: { in: codes }, type: { in: ['demand_category', 'industry'] } },
      select: { code: true, label: true },
    })
    const labels = new Map(entries.map((entry) => [entry.code, entry.label]))
    return demands.map((demand) => ({ ...demand, categoryLabel: labels.get(demand.category) ?? demand.category }))
  }

  /* 可编辑字段（新增/编辑共用）：预算空 → 面议；contactEmail/respondPoints 空 → 清空 */
  private editableData(dto: CreateDemandDto | UpdateDemandDto) {
    return {
      title: dto.title,
      category: dto.category,
      demandType: dto.demandType ?? 'task',
      deliverable: dto.deliverable?.trim() || null,
      deliverBy: dto.deliverBy || null,
      cooperationNeed: dto.cooperationNeed?.trim() || null,
      returnOffer: dto.returnOffer?.trim() || null,
      bottleneck: dto.bottleneck?.trim() || null,
      partnershipMode: dto.partnershipMode?.trim() || null,
      budget: (dto.budget ?? '').trim() || '面议',
      period: dto.period,
      deadline: dto.deadline,
      description: sanitizeHtml(dto.description),
      visibilityIdentities: dto.visibilityIdentities,
      visibilityLevels: dto.visibilityLevels,
      enrollmentIdentities: dto.enrollmentIdentities,
      enrollmentLevels: dto.enrollmentLevels,
      contactName: dto.contactName ?? null,
      contactPhone: dto.contactPhone ?? null,
      contactEmail: dto.contactEmail || null,
      contactPublic: dto.contactPublic ?? false,
      respondNeedReview: dto.respondNeedReview ?? true,
      respondPoints: dto.respondPoints ?? null,
    }
  }
}
