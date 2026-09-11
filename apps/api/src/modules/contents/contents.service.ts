import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Article, ShowcaseRequest } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import { toIdentityDto } from '../users/user.mapper'
import type { ArticlePayloadDto } from './dto/article-payload.dto'
import type { ReviewArticleDto } from './dto/review-article.dto'
import type { ScheduleArticleDto } from './dto/schedule-article.dto'
import type { ColumnPayloadDto } from './dto/column-payload.dto'
import type { QueryArticlesDto } from './dto/query-articles.dto'
import type { QueryShowcaseRequestsDto } from './dto/query-showcase-requests.dto'
import type { ReviewShowcaseRequestDto } from './dto/review-showcase-request.dto'

/* 展示页申请审核时间线（ApprovalRecord） */
interface ApprovalRecord {
  step: string
  operator: string
  action: 'submit' | 'approve' | 'reject'
  comment: string
  at: string
}

/* 栏目列表 DTO（含文章数聚合） */
interface ColumnDto {
  id: string
  name: string
  description: string
  sort: number
  submissionOpen: boolean
  system: boolean
  status: string
  createdAt: string
  articleCount: number
}

/** 系统保留栏目「未指定」：删除栏目时文章转移目标；不可编辑/停用/删除，成员端不可见 */
const RESERVED_COLUMN_ID = 'COL_NONE'
const RESERVED_COLUMN_NAME = '未指定'

/** 取 ID 末尾数字，如 'A1010' -> 1010 */
function numericSuffix(id: string): number {
  const m = id.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

/* Prisma 行 → Article 形状：栏目以数组契约承载单选；可空字段缺失时省略（对齐 undefined） */
function toArticleDto(a: Article): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    id: a.id,
    title: a.title,
    channel: a.channel,
    columnIds: [a.columnId],
    columnNames: [a.columnName],
    columnId: a.columnId,
    columnName: a.columnName,
    authorId: a.authorId,
    authorName: a.authorName,
    authorIdentity: a.authorIdentity,
    status: a.status,
    views: a.views,
    summary: a.summary,
    content: a.content,
    tags: a.tags,
    createdAt: a.createdAt,
  }
  if (a.scheduledAt != null) dto.scheduledAt = a.scheduledAt
  if (a.publishedAt != null) dto.publishedAt = a.publishedAt
  if (a.rejectedReason != null) dto.rejectedReason = a.rejectedReason
  return dto
}

function toShowcaseRequestDto(s: ShowcaseRequest): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    id: s.id,
    targetType: s.targetType,
    targetName: s.targetName,
    contentSummary: s.contentSummary,
    submitterName: s.submitterName,
    submitterPhone: s.submitterPhone,
    submittedAt: s.submittedAt,
    status: s.status,
    records: s.records,
  }
  if (s.targetId != null) dto.targetId = s.targetId
  if (s.rejectReason != null) dto.rejectReason = s.rejectReason
  return dto
}

/* 内容管理（wiki-backend.md §7.14/§8.1/§8.9）：
 * 文章分来源 channel：official 社区自行发布（新增即待发布）/ submitted 用户投稿（新增即待审核）；
 * 状态机 pending →(review approved)→ pending_release | (rejected)→ rejected；
 *   pending_release →(publish)→ published | (schedule)→ scheduled；scheduled →(cancel)→ pending_release | (publish)→ published；
 *   published →(withdraw)→ pending_release；pending/rejected/pending_release →(delete)→ 软删；
 * 栏目改名 → 级联刷新文章 columnName 快照；展示页审核 → 企业目标联动 Enterprise.showcaseStatus。 */
@Injectable()
export class ContentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  /* ---------- 文章管理 ---------- */

  async articles(query: QueryArticlesDto): Promise<{ list: Record<string, unknown>[]; total: number }> {
    const where: Prisma.ArticleWhereInput = { deletedAt: null }
    if (query.keyword) {
      const kw = query.keyword.trim()
      where.OR = [
        { title: { contains: kw, mode: 'insensitive' } },
        { authorName: { contains: kw, mode: 'insensitive' } },
        { id: { contains: kw, mode: 'insensitive' } },
      ]
    }
    if (query.columnId) where.columnId = query.columnId
    if (query.status) where.status = query.status
    if (query.channel) where.channel = query.channel

    const rows = await this.prisma.article.findMany({ where })

    /* 排序：id 按编号数值、views 按数值、createdAt 按字典序 */
    const field = query.sortBy ?? 'id'
    const dir = query.sortOrder === 'ascend' ? 1 : -1
    rows.sort((a, b) => {
      if (field === 'id') {
        const av = numericSuffix(a.id)
        const bv = numericSuffix(b.id)
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      }
      if (field === 'views') {
        return (a.views - b.views) * dir
      }
      return a.createdAt < b.createdAt ? -1 * dir : a.createdAt > b.createdAt ? 1 * dir : 0
    })

    const total = rows.length
    const start = (query.page - 1) * query.pageSize
    return { list: rows.slice(start, start + query.pageSize).map(toArticleDto), total }
  }

  async createArticle(payload: ArticlePayloadDto): Promise<Record<string, unknown>> {
    const channel = payload.channel ?? 'official'
    const columnId = payload.columnIds?.[0]
    if (!columnId) throw new BadRequestException('请选择所属栏目')
    const column = await this.prisma.articleColumn.findUnique({ where: { id: columnId } })
    if (!column) throw new NotFoundException('所属栏目不存在')

    const { authorId, authorName, authorIdentity } = await this.resolveAuthor(payload, channel)

    const article = await this.prisma.article.create({
      data: {
        id: await this.ids.next(channel === 'submitted' ? 'SU' : 'A'),
        title: payload.title,
        channel,
        columnId: column.id,
        columnName: column.name,
        authorId,
        authorName,
        authorIdentity,
        status: channel === 'official' ? 'pending_release' : 'pending',
        ...(channel === 'official' ? { archivableAt: formatNow() } : {}),
        content: sanitizeHtml(payload.content),
        scheduledAt: null,
        publishedAt: null,
        views: 0,
        summary: payload.summary,
        tags: payload.tags,
        createdAt: formatNow(),
        rejectedReason: null,
      },
    })
    await this.bindAssets(article.content, channel, article.id)
    return toArticleDto(article)
  }

  async updateArticle(id: string, payload: ArticlePayloadDto): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'pending_release' && article.status !== 'scheduled' && article.status !== 'rejected') {
      throw new ConflictException('仅待发布、定时发布中或已驳回的文章可编辑')
    }

    const columnId = payload.columnIds?.[0]
    if (!columnId) throw new BadRequestException('请选择所属栏目')
    const column = await this.prisma.articleColumn.findUnique({ where: { id: columnId } })
    if (!column) throw new NotFoundException('所属栏目不存在')

    /* 被驳回的投稿允许修改后重新进入待审核；待发布/定时发布中的自主文章保持原状态 */
    const nextStatus = article.status === 'rejected' ? 'pending' : article.status
    const content = sanitizeHtml(payload.content)

    await this.prisma.article.update({
      where: { id },
      data: {
        title: payload.title,
        columnId: column.id,
        columnName: column.name,
        summary: payload.summary,
        content,
        tags: payload.tags,
        status: nextStatus,
        rejectedReason: null,
        ...(nextStatus !== 'scheduled' ? { scheduledAt: null } : {}),
      },
    })
    await this.bindAssets(content, article.channel, article.id)
    return { code: 0 }
  }

  /** 将正文引用的素材绑定到当前文章（素材库来源标签/筛选；绑定后替换素材即对引用页面生效） */
  private async bindAssets(content: string, channel: string, articleId: string): Promise<void> {
    const keys = [...content.matchAll(/\/api\/public\/files\/([A-Za-z0-9._-]+)/g)].map((m) => m[1])
    if (!keys.length) return
    await this.prisma.mallAsset.updateMany({
      where: { storeKey: { in: [...new Set(keys)] } },
      data: { sourceType: channel === 'submitted' ? 'submission' : 'article', sourceId: articleId },
    })
  }

  /** 审核投稿：approved → 待发布；rejected → 已驳回并记录原因 */
  async reviewArticle(id: string, dto: ReviewArticleDto, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'pending') throw new ConflictException('仅待审核的文章可审核')
    const comment = (dto.comment ?? '').trim()
    if (dto.status === 'rejected' && !comment) throw new BadRequestException('请填写驳回原因')

    const after =
      dto.status === 'approved'
        ? {
            status: 'pending_release',
            rejectedReason: null,
            archivableAt: formatNow(),
          }
        : { status: 'rejected', rejectedReason: comment, archivableAt: formatNow() }

    await this.prisma.article.update({ where: { id }, data: after })

    await this.audit.record({
      module: '内容管理',
      action: dto.status === 'approved' ? '文章审核通过' : '文章驳回',
      target: `${article.id} · ${article.title}`,
      detail: comment || undefined,
      before: { status: article.status },
      after,
      operator,
    })
    return { code: 0 }
  }

  /** 立即发布：待发布 / 定时发布中 → 已发布 */
  async publishArticle(id: string, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'pending_release' && article.status !== 'scheduled') {
      throw new ConflictException('仅待发布或定时发布中的文章可发布')
    }
    await this.prisma.article.update({
      where: { id },
      data: { status: 'published', scheduledAt: null, publishedAt: formatNow() },
    })
    await this.audit.record({
      module: '内容管理',
      action: '文章发布',
      target: `${article.id} · ${article.title}`,
      before: { status: article.status },
      after: { status: 'published' },
      operator,
    })
    return { code: 0 }
  }

  /** 设置定时发布：待发布 → 定时发布中 */
  async scheduleArticle(id: string, dto: ScheduleArticleDto, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'pending_release') throw new ConflictException('仅待发布的文章可设置定时发布')
    const scheduledAt = dto.scheduledAt.trim()
    if (scheduledAt <= formatNow()) throw new BadRequestException('定时发布时间需晚于当前时间')

    await this.prisma.article.update({ where: { id }, data: { status: 'scheduled', scheduledAt } })
    await this.audit.record({
      module: '内容管理',
      action: '文章定时发布',
      target: `${article.id} · ${article.title}`,
      detail: `计划发布时间 ${scheduledAt}`,
      before: { status: article.status },
      after: { status: 'scheduled', scheduledAt },
      operator,
    })
    return { code: 0 }
  }

  /** 取消定时发布：定时发布中 → 待发布 */
  async cancelSchedule(id: string, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'scheduled') throw new ConflictException('仅定时发布中的文章可取消定时')
    await this.prisma.article.update({ where: { id }, data: { status: 'pending_release', scheduledAt: null } })
    await this.audit.record({
      module: '内容管理',
      action: '取消文章定时发布',
      target: `${article.id} · ${article.title}`,
      before: { status: article.status },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  /** 下架：已发布 → 待发布 */
  async withdrawArticle(id: string, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'published') throw new ConflictException('仅已发布的文章可下架')
    await this.prisma.article.update({
      where: { id },
      data: { status: 'pending_release', publishedAt: null, scheduledAt: null },
    })
    await this.audit.record({
      module: '内容管理',
      action: '文章下架',
      target: `${article.id} · ${article.title}`,
      before: { status: article.status },
      after: { status: 'pending_release' },
      operator,
    })
    return { code: 0 }
  }

  /** 删除文章（软删）：投稿允许已驳回 / 待审核；官方资讯允许待发布 */
  async deleteArticle(id: string, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (!['pending', 'rejected', 'pending_release'].includes(article.status)) {
      throw new ConflictException('仅待审核、已驳回或待发布的文章可删除')
    }
    await this.prisma.article.update({
      where: { id },
      data: { deletedAt: formatNow(), deletedBy: operator },
    })
    await this.audit.record({
      module: '内容管理',
      action: '删除文章',
      target: `${article.id} · ${article.title}`,
      before: { status: article.status },
      after: { deleted: true },
      operator,
    })
    return { code: 0 }
  }

  /** 作者解析（authorId 可空）：U 前缀 → 用户 + 身份快照；E / XE 前缀 → 企业名；未提供名称时回退默认展示名 */
  private async resolveAuthor(
    payload: ArticlePayloadDto,
    channel: 'official' | 'submitted',
  ): Promise<{
    authorId: string | null
    authorName: string
    authorIdentity: Prisma.InputJsonValue | typeof Prisma.DbNull
  }> {
    const authorId = payload.authorId?.trim() || null
    let authorName = (payload.authorName ?? '').trim()
    let authorIdentity: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull

    if (authorId) {
      if (authorId.startsWith('U')) {
        const user = await this.prisma.user.findUnique({
          where: { uid: authorId },
          include: { identities: { orderBy: { id: 'asc' } } },
        })
        if (!user) throw new NotFoundException('作者用户不存在')
        if (!authorName) authorName = user.nickname
        const identity =
          user.identities.find((i) => i.type === 'community_individual') ??
          user.identities.find((i) => i.type === 'individual') ??
          null
        if (identity) authorIdentity = toIdentityDto(identity) as unknown as Prisma.InputJsonValue
      } else if (authorId.startsWith('XE')) {
        const external = await this.prisma.externalEnterpriseProfile.findUnique({ where: { id: authorId } })
        if (!external) throw new NotFoundException('作者企业不存在')
        if (!authorName) authorName = external.name
      } else {
        const enterprise = await this.prisma.enterprise.findUnique({ where: { id: authorId } })
        if (!enterprise) throw new NotFoundException('作者企业不存在')
        if (!authorName) authorName = enterprise.name
      }
    }

    if (!authorName) authorName = channel === 'official' ? '社区运营' : '投稿用户'
    return { authorId, authorName, authorIdentity }
  }

  /* ---------- 栏目管理 ---------- */

  async columns(): Promise<ColumnDto[]> {
    const [columns, counts] = await Promise.all([
      this.prisma.articleColumn.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.article.groupBy({
        by: ['columnId'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ])
    const countMap = new Map(counts.map((c) => [c.columnId, c._count._all]))
    return columns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sort: c.sort,
      submissionOpen: c.submissionOpen,
      system: c.system,
      status: c.status,
      createdAt: c.createdAt,
      articleCount: countMap.get(c.id) ?? 0,
    }))
  }

  async createColumn(payload: ColumnPayloadDto): Promise<Record<string, unknown>> {
    const dup = await this.prisma.articleColumn.findFirst({ where: { name: payload.name.trim() } })
    if (dup) throw new ConflictException('栏目名称已存在')
    const column = await this.prisma.articleColumn.create({
      data: {
        id: await this.ids.next('CL'),
        name: payload.name,
        description: payload.description,
        sort: payload.sort,
        submissionOpen: payload.submissionOpen,
        system: false,
        status: 'enabled',
        createdAt: formatToday(),
      },
    })
    return {
      id: column.id,
      name: column.name,
      description: column.description,
      sort: column.sort,
      submissionOpen: column.submissionOpen,
      system: column.system,
      status: column.status,
      createdAt: column.createdAt,
    }
  }

  async updateColumn(id: string, payload: ColumnPayloadDto): Promise<{ code: number }> {
    const column = await this.prisma.articleColumn.findUnique({ where: { id } })
    if (!column) throw new NotFoundException('栏目不存在')
    if (column.system) throw new ConflictException('系统保留栏目不可编辑')
    const name = payload.name.trim()
    const dup = await this.prisma.articleColumn.findFirst({ where: { name, id: { not: id } } })
    if (dup) throw new ConflictException('栏目名称已存在')

    await this.prisma.articleColumn.update({
      where: { id },
      data: {
        name: payload.name,
        description: payload.description,
        sort: payload.sort,
        submissionOpen: payload.submissionOpen,
      },
    })

    /* 改名 → 级联刷新文章 columnName 快照 */
    if (column.name !== payload.name) {
      await this.prisma.article.updateMany({
        where: { columnId: id },
        data: { columnName: payload.name },
      })
    }
    return { code: 0 }
  }

  async toggleColumnStatus(id: string): Promise<{ code: number }> {
    const column = await this.prisma.articleColumn.findUnique({ where: { id } })
    if (!column) throw new NotFoundException('栏目不存在')
    if (column.system) throw new ConflictException('系统保留栏目不可停用')
    await this.prisma.articleColumn.update({
      where: { id },
      data: { status: column.status === 'enabled' ? 'disabled' : 'enabled' },
    })
    return { code: 0 }
  }

  /** 开放/关闭投稿开关 */
  async toggleColumnSubmission(id: string): Promise<{ code: number }> {
    const column = await this.prisma.articleColumn.findUnique({ where: { id } })
    if (!column) throw new NotFoundException('栏目不存在')
    if (column.system) throw new ConflictException('系统保留栏目不可变更')
    await this.prisma.articleColumn.update({
      where: { id },
      data: { submissionOpen: !column.submissionOpen },
    })
    return { code: 0 }
  }

  /** 删除栏目：其文章自动转移至「未指定」保留栏目 */
  async deleteColumn(id: string): Promise<{ code: number }> {
    const column = await this.prisma.articleColumn.findUnique({ where: { id } })
    if (!column) throw new NotFoundException('栏目不存在')
    if (column.system) throw new ConflictException('系统保留栏目不可删除')

    await this.prisma.$transaction(async (tx) => {
      const reserved = await tx.articleColumn.findUnique({ where: { id: RESERVED_COLUMN_ID } })
      if (reserved) {
        await tx.article.updateMany({
          where: { columnId: id },
          data: { columnId: RESERVED_COLUMN_ID, columnName: RESERVED_COLUMN_NAME },
        })
      }
      await tx.articleColumn.delete({ where: { id } })
    })
    return { code: 0 }
  }

  /* ---------- 展示页发布申请 ---------- */

  async showcaseRequests(query: QueryShowcaseRequestsDto): Promise<{ list: Record<string, unknown>[]; total: number }> {
    const where: Prisma.ShowcaseRequestWhereInput = {}
    if (query.targetType) where.targetType = query.targetType
    if (query.status) where.status = query.status

    const [rows, total] = await Promise.all([
      this.prisma.showcaseRequest.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.showcaseRequest.count({ where }),
    ])
    return { list: rows.map(toShowcaseRequestDto), total }
  }

  async reviewShowcaseRequest(
    id: string,
    dto: ReviewShowcaseRequestDto,
    operator: string,
  ): Promise<{ code: number }> {
    const request = await this.prisma.showcaseRequest.findUnique({ where: { id } })
    if (!request) throw new NotFoundException('展示页申请不存在')
    if (request.status !== 'pending') throw new ConflictException('该申请已处理，请勿重复审核')

    const comment = (dto.comment ?? '').trim()

    /* 企业目标联动（先校验目标存在，避免写入后联动失败的部分状态） */
    if (request.targetType === 'enterprise' && request.targetId) {
      const ent = await this.prisma.enterprise.findUnique({ where: { id: request.targetId } })
      if (!ent) throw new NotFoundException('企业不存在')
    }

    const record: ApprovalRecord = {
      step: '管理员审核',
      operator,
      action: dto.status === 'approved' ? 'approve' : 'reject',
      comment: comment || (dto.status === 'approved' ? '审核通过' : ''),
      at: formatNow(),
    }
    const records = this.appendRecord(request.records, record)

    await this.prisma.showcaseRequest.update({
      where: { id },
      data: {
        status: dto.status,
        records,
        ...(dto.status === 'rejected' ? { rejectReason: comment } : {}),
      },
    })

    if (request.targetType === 'enterprise' && request.targetId) {
      await this.prisma.enterprise.update({
        where: { id: request.targetId },
        data: {
          showcaseStatus: dto.status === 'approved' ? 'published' : 'rejected',
          ...(dto.status === 'rejected' ? { showcaseComment: comment } : {}),
        },
      })
    }
    return { code: 0 }
  }

  private appendRecord(raw: Prisma.JsonValue, record: ApprovalRecord): Prisma.InputJsonValue {
    const list: ApprovalRecord[] = Array.isArray(raw) ? (raw as unknown as ApprovalRecord[]) : []
    return [...list, record] as unknown as Prisma.InputJsonValue
  }
}
