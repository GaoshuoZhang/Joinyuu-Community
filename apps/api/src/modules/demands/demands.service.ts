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
import { normalizeHiddenFields } from '../../common/demands/respondent-fields'
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
import type { UpdateRespondentDto } from './dto/update-respondent.dto'
import type { InitiateProjectDto } from './dto/initiate-project.dto'

/** 响应行 + 响应者账号（列表展示真实姓名 / 昵称 / 用户 ID，用于区分同名用户；代报名无账号时为空） */
type RespondentWithUser = DemandRespondent & {
  user?: { uid: string; nickname: string; realName: string | null } | null
}
type DemandWithRespondents = Demand & { respondents: RespondentWithUser[] }

/** 响应者账号查询字段（真实姓名/昵称/用户 ID）：响应列表与响应审核列表共用 */
const RESPONDENT_USER_SELECT = { uid: true, nickname: true, realName: true } as const

type DemandRow = Omit<DemandWithRespondents, 'respondents'>

export interface RespondentDto {
  /** 响应记录编号（响应审核定位、列表稳定行键） */
  id: number
  /** 响应者用户 ID（代报名等无账号的响应不落此字段） */
  userId?: string
  /** 响应者真实姓名（来自账号，非响应快照；与昵称、用户 ID 一起用于区分同名用户） */
  realName?: string
  /** 响应者昵称 */
  nickname?: string
  /** 响应者身份快照（type/enterpriseName 等），列表用于身份标签 */
  responderIdentity?: Prisma.JsonValue
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
  /** 对需求方隐藏的响应字段（响应审核通过时勾选；后台始终可见真实值） */
  hiddenFields?: string[]
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
  /** 关联项目状态（closed/archived 时允许「重新立项」；已归档项目记为 archived） */
  projectStatus?: string
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
  /** 响应者用户 ID（代报名等无账号的响应不落此字段） */
  userId?: string
  /** 响应者真实姓名 / 昵称（来自账号；与用户 ID 一起用于区分同名用户） */
  realName?: string
  nickname?: string
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
  /** 对需求方隐藏的响应字段（响应审核通过时勾选；后台始终可见真实值） */
  hiddenFields?: string[]
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

function toRespondentDto(r: RespondentWithUser): RespondentDto {
  const dto: RespondentDto = {
    id: r.id,
    name: r.name,
    enterprise: r.enterprise,
    message: r.message,
    at: r.at,
    status: r.status,
  }
  /* 响应者账号口径（真实姓名/昵称/用户 ID）：后台与发布者列表据此区分同名用户；代报名无账号则不下发 */
  if (r.userId != null) dto.userId = r.userId
  if (r.user?.realName != null) dto.realName = r.user.realName
  if (r.user?.nickname != null) dto.nickname = r.user.nickname
  /* 身份快照：响应人列据此展示「真实姓名（身份 · 昵称 · 用户ID）」中的身份段 */
  if (r.responderIdentity != null) dto.responderIdentity = r.responderIdentity
  if (r.phone != null) dto.phone = r.phone
  if (r.email != null) dto.email = r.email
  if (r.quote != null) dto.quote = r.quote
  if (r.timeline != null) dto.timeline = r.timeline
  if (r.cases != null) dto.cases = r.cases
  if (r.reviewAt != null) dto.reviewedAt = r.reviewAt
  if (r.rejectReason != null) dto.rejectReason = r.rejectReason
  if (r.hiddenFields.length > 0) dto.hiddenFields = r.hiddenFields
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
    /* 只映射「有效响应」（未撤回）：已撤回/审核驳回失效的记录不进「响应记录」，与列表「N 人响应」口径一致 */
    respondents: active.map(toRespondentDto),
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
    if (query.status) where.status = { in: query.status }
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

    /* 仅当页批量补取响应记录（替代全量 include，随分页收缩载入量）；连带响应者账号字段供列表显示姓名口径 */
    const respondents = rows.length
      ? await this.prisma.demandRespondent.findMany({
          where: { demandId: { in: rows.map((d) => d.id) } },
          orderBy: { id: 'asc' },
          include: { user: { select: RESPONDENT_USER_SELECT } },
        })
      : []
    const byDemand = new Map<string, RespondentWithUser[]>()
    for (const r of respondents) {
      const arr = byDemand.get(r.demandId) ?? []
      arr.push(r)
      byDemand.set(r.demandId, arr)
    }

    const demandDtos = rows.map((d) => toDemandDto({ ...d, respondents: byDemand.get(d.id) ?? [] }))
    return { list: await this.attachProjectStatus(await this.withCategoryLabels(demandDtos)), total }
  }

  async findOne(id: string): Promise<DemandDto> {
    const demand = await this.prisma.demand.findUnique({
      where: { id },
      include: {
        respondents: { orderBy: { id: 'asc' }, include: { user: { select: RESPONDENT_USER_SELECT } } },
      },
    })
    if (!demand) throw new NotFoundException('需求不存在')
    const [dto] = await this.withCategoryLabels([toDemandDto(demand)])
    return (await this.attachProjectStatus([dto]))[0]
  }

  /** 补关联项目状态（已归档项目记为 `archived`）：立项后「重新立项」入口据此判断关联项目是否已关闭/归档（D） */
  private async attachProjectStatus(dtos: DemandDto[]): Promise<DemandDto[]> {
    const ids = [...new Set(dtos.map((d) => d.projectId).filter((v): v is string => !!v))]
    if (ids.length === 0) return dtos
    const projects = await this.prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, deletedAt: true },
    })
    const byId = new Map(projects.map((p) => [p.id, p.deletedAt != null ? 'archived' : p.status]))
    return dtos.map((d) => (d.projectId && byId.has(d.projectId) ? { ...d, projectStatus: byId.get(d.projectId) } : d))
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
    /* 需求详情「响应记录」待审核条目跳转：仅看该需求的待审核响应 */
    if (query.demandId) where.demandId = query.demandId
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
        include: {
          demand: { select: { id: true, title: true, status: true, publisherName: true } },
          user: { select: RESPONDENT_USER_SELECT },
        },
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
        /* 响应者账号口径：真实姓名 / 昵称 / 用户 ID（区分同名用户） */
        if (r.userId != null) dto.userId = r.userId
        if (r.user?.realName != null) dto.realName = r.user.realName
        if (r.user?.nickname != null) dto.nickname = r.user.nickname
        if (r.responderIdentity != null) dto.responderIdentity = r.responderIdentity
        if (r.quote != null) dto.quote = r.quote
        if (r.timeline != null) dto.timeline = r.timeline
        if (r.cases != null) dto.cases = r.cases
        if (r.phone != null) dto.phone = r.phone
        if (r.email != null) dto.email = r.email
        if (r.hiddenFields.length > 0) dto.hiddenFields = r.hiddenFields
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
    /* 通过时可由管理员勾选「向需求方显示」的字段：未勾选的字段写入 hiddenFields，发布者侧逐项省略 */
    const hiddenFields = approved ? normalizeHiddenFields(dto.hiddenFields) : []
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.demandRespondent.updateMany({
        where: { id, demandId: demand.id, status: 'pending_review', withdrawnAt: null },
        data: approved
          ? { status: 'pending', reviewAt: now, hiddenFields }
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
      after: approved ? { status: 'pending', hiddenFields } : { status: 'rejected', rejectReason: reason },
      operator,
    })
    return { code: 0 }
  }

  /* 编辑响应内容（响应审核页「编辑」）：仅待审核响应可改，响应方基本信息（姓名/所属/身份）不可改。
   * 通过后该响应已对发布者生效，改动会影响发布者已看到的内容，故一律 409。 */
  async updateRespondent(
    demandId: string,
    respondentId: string,
    dto: UpdateRespondentDto,
    operator: string,
  ): Promise<{ code: number }> {
    const id = Number.parseInt(respondentId, 10)
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException('响应不存在')
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId } })
    if (!demand) throw new NotFoundException('需求不存在')
    const respondent = await this.prisma.demandRespondent.findUnique({ where: { id } })
    if (!respondent || respondent.demandId !== demand.id) throw new NotFoundException('响应不存在')
    if (respondent.status !== 'pending_review' || respondent.withdrawnAt != null) {
      throw new ConflictException('仅待审核的响应可编辑')
    }

    const message = dto.message.trim()
    if (!message) throw new BadRequestException('响应说明不能为空')
    /* 空串表示清空原值（手机号/邮箱）；未传字段保持原值 */
    const text = (value?: string) => value?.trim() || null
    const email = text(dto.email)

    await this.prisma.demandRespondent.update({
      where: { id },
      data: {
        message,
        quote: text(dto.quote),
        timeline: text(dto.timeline),
        cases: text(dto.cases),
        phone: text(dto.phone),
        email,
      },
    })
    await this.audit.record({
      module: '需求管理',
      action: '编辑响应',
      target: `${demand.id} · ${demand.title}`,
      detail: `响应人：${respondent.name}（响应内容更新）`,
      before: {
        message: respondent.message,
        quote: respondent.quote,
        timeline: respondent.timeline,
        cases: respondent.cases,
        phone: respondent.phone,
        email: respondent.email,
      },
      after: {
        message,
        quote: text(dto.quote),
        timeline: text(dto.timeline),
        cases: text(dto.cases),
        phone: text(dto.phone),
        email,
      },
      operator,
    })
    return { code: 0 }
  }

  /* 立项：published|selected → projected；项目新增与双向关联（demand.projectId ↔ project.sourceDemandId）置于同一事务。
   * 承接方与响应的收敛：与立项承接方同主体的响应 → undertaken（已承接）；已选定（或本次勾选）但未入选的响应 → closed（已结束）并站内信告知。
   * 立项积分/经验与「承接成功」通知只发给**实际承接**的响应者。 */
  async initiateProject(id: string, dto: InitiateProjectDto, operator: string) {
    const demand = await this.prisma.demand.findUnique({ where: { id } })
    if (!demand) throw new NotFoundException('需求不存在')
    /* 已立项需求：关联项目已关闭/归档时允许「重新立项」（新建项目并切换到新项目，原项目保留为历史）（D） */
    const isReinitiate = demand.status === 'projected'
    if (isReinitiate) {
      const current = demand.projectId
        ? await this.prisma.project.findUnique({
            where: { id: demand.projectId },
            select: { status: true, deletedAt: true },
          })
        : null
      if (!current || (current.status !== 'closed' && current.deletedAt == null)) {
        throw new ConflictException('关联项目仍在进行，暂不可重新立项')
      }
    } else if (demand.status !== 'published' && demand.status !== 'selected') {
      throw new ConflictException('仅已发布或已选定承接方的需求可立项')
    }

    /* 立项采用的承接方与响应记录的对应关系（事务外先算好，事务内用条件更新落地）：
     * - accepted：发布者已选定的承接方
     * - pending：本次「选定承接方」由管理员代需求方勾选的响应（dto.respondentIds）
     * - 全部未撤回响应：管理员在立项表单里手工补选的承接方若曾响应，也要落到「已承接」 */
    const requestedIds = [...new Set(dto.respondentIds ?? [])]
    const [accepted, pendingRows, reviewRows] = await Promise.all([
      this.prisma.demandRespondent.findMany({ where: { demandId: demand.id, status: 'accepted', withdrawnAt: null } }),
      this.prisma.demandRespondent.findMany({ where: { demandId: demand.id, status: 'pending', withdrawnAt: null } }),
      /* 待审核响应：立项不得以「未过审」的响应者承接，否则该响应永不被审核、积分与通知也不发 */
      this.prisma.demandRespondent.findMany({ where: { demandId: demand.id, status: 'pending_review', withdrawnAt: null } }),
    ])
    const requested = pendingRows.filter((r) => requestedIds.includes(r.id))
    if (requested.length !== requestedIds.length) {
      throw new BadRequestException('存在不可选定的响应（仅待处理的响应可选定，请刷新后重试）')
    }

    const candidates = [...accepted, ...pendingRows.filter((r) => !accepted.some((a) => a.id === r.id))]
    const externalIds = await this.resolveExternalEnterpriseIds([...candidates, ...reviewRows])
    const undertakerKeys = new Set(dto.undertakers.map((u) => `${u.type}:${u.id}`))
    const subjectKeyOf = (r: DemandRespondent): string | null => {
      const ri = r.responderIdentity as Record<string, unknown> | null
      if (ri?.type === 'community_enterprise' && ri.enterpriseId) return `enterprise:${ri.enterpriseId}`
      if (ri?.type === 'external_enterprise') {
        const matched = externalIds.get(this.rowKey(r))
        return matched ? `enterprise:${matched}` : null
      }
      return r.userId ? `individual:${r.userId}` : null
    }
    /* 承接方对应响应仍在待审核：拒绝立项，避免绕过响应审核（该响应也无法被收敛为终态） */
    const blockedByReview = reviewRows.find((r) => {
      const key = subjectKeyOf(r)
      return key != null && undertakerKeys.has(key)
    })
    if (blockedByReview) {
      throw new ConflictException(
        `承接方「${blockedByReview.name}」的响应仍在「待审核」，请先在「响应审核」中处理后再立项`,
      )
    }
    /* 入选（承接方与响应同主体）→ 已承接；其余**全部有效响应**（已选定 / 本次勾选 / 未入选的待选定）
     * → 已结束，避免立项后仍悬挂「待选定 / 已选定」并可点击必然 409 的撤回 */
    const undertaken = candidates.filter((r) => {
      const key = subjectKeyOf(r)
      return key != null && undertakerKeys.has(key)
    })
    const undertakenIds = new Set(undertaken.map((r) => r.id))
    const dropped = candidates.filter((r) => !undertakenIds.has(r.id))

    const project = await this.prisma.$transaction(async (tx) => {
      /* 条件抢占：仅当需求仍为 published/selected 且未立项（或已立项但关联项目未变）时才准予立项，
       * 避免并发重复立项；重新立项时锁定原 projectId 不变，防止并发期间项目被替换 */
      const claim = await tx.demand.updateMany({
        where: isReinitiate
          ? { id: demand.id, deletedAt: null, status: 'projected', projectId: demand.projectId }
          : { id: demand.id, deletedAt: null, status: { in: ['published', 'selected'] }, projectId: null },
        data: { status: 'projected', archivableAt: formatNow() },
      })
      if (claim.count !== 1) throw new ConflictException('该需求已立项或被处理')

      /* 本次勾选的响应先落「已选定」：抢占失败即说明状态已变化，整体回滚 */
      if (requestedIds.length) {
        const claimed = await tx.demandRespondent.updateMany({
          where: { demandId: demand.id, id: { in: requestedIds }, status: 'pending', withdrawnAt: null },
          data: { status: 'accepted' },
        })
        if (claimed.count !== requestedIds.length) throw new ConflictException('响应状态已变化，请刷新后重试')
      }

      /* 需求立项：项目需求方/创建人/联系方式/合同价格一律照搬需求快照（客户端传值不生效），
       * 保证项目详情可追溯需求方，且需求发布方（含企业联系人）可访问项目。
       * 社区自建需求（后台代发，publisherIdentity.type='official'）在客户端无对应账号，
       * 统一标记为「社区官方」，避免把后台账号当作一个用户展示（H）。 */
      const isOfficialPublisher = (demand.publisherIdentity as { type?: string } | null)?.type === 'official'
      const created = await this.projects.createProjectInHostTx(tx, {
        ...dto,
        demanderId: isOfficialPublisher ? '' : demand.publisherId,
        demanderName: isOfficialPublisher ? '社区官方' : demand.publisherName,
        demanderIdentity: isOfficialPublisher
          ? { type: 'official', title: demand.publisherName }
          : ((demand.publisherIdentity ?? null) as Prisma.InputJsonValue | null),
        creatorName: isOfficialPublisher ? '社区官方' : demand.publisherName,
        creatorId: isOfficialPublisher ? '' : demand.publisherId,
        contactName: demand.contactName ?? undefined,
        contactPhone: demand.contactPhone ?? undefined,
        contactEmail: demand.contactEmail ?? undefined,
        contractPrice: demand.budget,
      })
      await tx.project.update({ where: { id: created.id }, data: { sourceDemandId: demand.id } })
      await tx.demand.update({ where: { id: demand.id }, data: { projectId: created.id } })

      /* 响应状态收敛：入选 → undertaken（客户端「我的响应」显示「已承接」）；
       * 已选定/已勾选但未入选 → closed（已结束），不再有「待选定/已选定」悬挂态 */
      if (undertakenIds.size) {
        await tx.demandRespondent.updateMany({
          where: { demandId: demand.id, id: { in: [...undertakenIds] } },
          data: { status: 'undertaken' },
        })
      }
      if (dropped.length) {
        await tx.demandRespondent.updateMany({
          where: { demandId: demand.id, id: { in: dropped.map((r) => r.id) } },
          data: { status: 'closed' },
        })
      }

      /* 立项奖励：发起方 + 实际承接的响应者（与需求承接规则一致，幂等键按需求维度去重） */
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
      for (const response of undertaken) {
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
      /* 未入选的响应者：明确告知本次未被采用，避免长期停留在「已选定」却毫无后续 */
      for (const response of dropped) {
        if (!response.userId) continue
        await this.notify.pushNoticeInTransaction(tx, response.userId, {
          type: 'demand',
          title: '需求立项结果',
          content: `您对需求「${demand.title}」的响应本次未被采用，该响应已结束。`,
          link: '/me/responses',
        })
      }
      return created
    })

    await this.audit.record({
      module: '需求管理',
      action: '需求立项',
      target: `${demand.id} · ${demand.title}`,
      detail: `生成项目 ${project.code}；承接响应 ${undertakenIds.size} 条，未入选收敛 ${dropped.length} 条`,
      before: { status: demand.status },
      after: { status: 'projected', projectId: project.id, undertakenRespondents: undertakenIds.size, droppedRespondents: dropped.length },
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
        /* 用户类承接方：真实姓名（身份 · 昵称 · 用户 ID）——多个同名/同昵称用户可区分 */
        return { group: tag, label: `${u.realName || u.nickname}（${tag} · ${u.nickname} · ${u.uid}）`, value: `individual:${u.uid}` }
      }),
    ]
  }

  /* 需求立项承接方预填：需求方已选定的承接方（status=accepted 且未撤回）转为承接方选项，
   * 与 undertakerOptions() 同形（value=enterprise:<企业ID> / individual:<用户ID> / custom:<组织名>），
   * 供「需求立项」表单自动带入（可多承接方）；需求未选定承接方时返回空数组。
   * 传入 respondentIds 时改为按指定响应记录（「立项前置选定承接方」勾选项，未撤回）取选项。 */
  async selectedRespondentOptions(demandId: string, respondentIds?: number[]): Promise<UndertakerOptionDto[]> {
    const demand = await this.prisma.demand.findUnique({ where: { id: demandId }, select: { id: true } })
    if (!demand) throw new NotFoundException('需求不存在')

    const requested = respondentIds?.filter((id) => Number.isInteger(id) && id > 0)
    const where: Prisma.DemandRespondentWhereInput = requested?.length
      ? { demandId, id: { in: requested }, withdrawnAt: null }
      : { demandId, status: 'accepted', withdrawnAt: null }
    const rows = await this.prisma.demandRespondent.findMany({ where, orderBy: { id: 'asc' } })
    if (rows.length === 0) return []

    const externalIds = await this.resolveExternalEnterpriseIds(rows)
    /* 个人/社区个体承接方：批量回查账号真实姓名与昵称，label 与 undertakerOptions() 同口径 */
    const userUids = [...new Set(rows.filter((r) => r.userId && !r.enterprise).map((r) => r.userId as string))]
    const users = userUids.length
      ? await this.prisma.user.findMany({ where: { uid: { in: userUids } }, include: { identities: true } })
      : []
    const userByUid = new Map(users.map((u) => [u.uid, u]))
    const seen = new Set<string>()
    const options: UndertakerOptionDto[] = []
    for (const row of rows) {
      const ri = row.responderIdentity as Record<string, unknown> | null
      const matchedEnterpriseId = ri?.type === 'community_enterprise'
        ? (ri.enterpriseId as string | undefined)
        : externalIds.get(this.rowKey(row))

      let option: UndertakerOptionDto
      if (matchedEnterpriseId) {
        option = {
          group: ri?.type === 'external_enterprise' ? '合作企业' : '社区企业',
          label: `${row.enterprise || row.name}（${ri?.type === 'external_enterprise' ? '合作企业' : '社区企业'} · ${matchedEnterpriseId}）`,
          value: `enterprise:${matchedEnterpriseId}`,
        }
      } else if (row.enterprise) {
        /* 合作企业未匹配到档案（或历史数据缺企业 ID）：按自定义承接方带入组织名，避免误标为个人 */
        option = {
          group: '自定义',
          label: `${row.enterprise}（合作企业 · 自定义）`,
          value: `custom:${encodeURIComponent(row.enterprise)}`,
        }
      } else if (row.userId) {
        const user = userByUid.get(row.userId)
        const tag = user?.identities.some((i) => i.type === 'community_individual') ? '社区个体' : '个人用户'
        const nickname = user?.nickname ?? row.name
        const realName = user?.realName || nickname
        option = { group: tag, label: `${realName}（${tag} · ${nickname} · ${row.userId}）`, value: `individual:${row.userId}` }
      } else {
        continue
      }
      if (seen.has(option.value)) continue
      seen.add(option.value)
      options.push(option)
    }
    return options
  }

  /** 合作企业响应按组织名回查企业档案 ID（同名多条取首条），供立项预填企业承接方 */
  private async resolveExternalEnterpriseIds(rows: DemandRespondent[]): Promise<Map<string, string>> {
    const names = rows
      .filter((r) => ((r.responderIdentity as Record<string, unknown> | null)?.type === 'external_enterprise') && !!r.enterprise)
      .map((r) => r.enterprise)
    if (names.length === 0) return new Map()
    const profiles = await this.prisma.externalEnterpriseProfile.findMany({ where: { name: { in: names } } })
    const byName = new Map(profiles.map((p) => [p.name, p.id]))
    const result = new Map<string, string>()
    for (const row of rows) {
      const id = byName.get(row.enterprise)
      if (id) result.set(this.rowKey(row), id)
    }
    return result
  }

  private rowKey(row: DemandRespondent): string {
    return `${row.demandId}:${row.id}`
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
