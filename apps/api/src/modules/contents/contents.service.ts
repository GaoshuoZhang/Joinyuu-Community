import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Article, ShowcaseRequest } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { toIdentityDto } from '../users/user.mapper'
import type { ArticlePayloadDto } from './dto/article-payload.dto'
import type { ReviewArticleDto } from './dto/review-article.dto'
import type { ColumnPayloadDto } from './dto/column-payload.dto'
import type { QueryArticlesDto } from './dto/query-articles.dto'
import type { QueryShowcaseRequestsDto } from './dto/query-showcase-requests.dto'
import type { ReviewShowcaseRequestDto } from './dto/review-showcase-request.dto'

/* 展示页申请审批时间线（ApprovalRecord） */
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
  status: string
  createdAt: string
  articleCount: number
}

/** 取 ID 末尾数字，如 'A1010' -> 1010 */
function numericSuffix(id: string): number {
  const m = id.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

/* Prisma 行 → M0 Article 形状：authorIdentity Json 透传；可空字段缺失时省略（对齐 mock undefined） */
function toArticleDto(a: Article): Record<string, unknown> {
  const dto: Record<string, unknown> = {
    id: a.id,
    title: a.title,
    columnId: a.columnId,
    columnName: a.columnName,
    authorId: a.authorId,
    authorName: a.authorName,
    authorIdentity: a.authorIdentity,
    status: a.status,
    views: a.views,
    summary: a.summary,
    tags: a.tags,
    createdAt: a.createdAt,
  }
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
 * 文章状态机 draft/rejected/withdrawn →(submit)→ pending →(review)→ published | rejected；published →(withdraw)→ withdrawn；
 * 栏目改名 → 级联刷新文章 columnName 快照；展示页审批 → 企业目标联动 Enterprise.showcaseStatus。 */
@Injectable()
export class ContentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
  ) {}

  /* ---------- 文章管理 ---------- */

  async articles(query: QueryArticlesDto): Promise<{ list: Record<string, unknown>[]; total: number }> {
    const where: Prisma.ArticleWhereInput = {}
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

    const rows = await this.prisma.article.findMany({ where })

    /* 排序：id 按编号数值、views 按数值、createdAt 按字典序（M0 fetchArticles 口径） */
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
    const column = await this.prisma.articleColumn.findUnique({ where: { id: payload.columnId } })
    if (!column) throw new NotFoundException('所属栏目不存在')
    const author = await this.prisma.user.findUnique({
      where: { uid: payload.authorId },
      include: { identities: { orderBy: { id: 'asc' } } },
    })
    if (!author) throw new NotFoundException('作者用户不存在')

    /* 身份快照：社区个体优先，其次个人用户，否则 null（M0 createArticle 口径） */
    const identity =
      author.identities.find((i) => i.type === 'community_individual') ??
      author.identities.find((i) => i.type === 'individual') ??
      null
    const authorIdentity = identity
      ? (toIdentityDto(identity) as unknown as Prisma.InputJsonValue)
      : Prisma.DbNull

    const article = await this.prisma.article.create({
      data: {
        id: await this.ids.next('A'),
        title: payload.title,
        columnId: column.id,
        columnName: column.name,
        authorId: author.uid,
        authorName: author.nickname,
        authorIdentity,
        status: 'draft',
        publishedAt: null,
        views: 0,
        summary: payload.summary,
        tags: payload.tags,
        createdAt: formatNow(),
        rejectedReason: null,
      },
    })
    return toArticleDto(article)
  }

  async updateArticle(id: string, payload: ArticlePayloadDto): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article) throw new NotFoundException('文章不存在')
    if (article.status !== 'draft' && article.status !== 'rejected' && article.status !== 'withdrawn') {
      throw new ConflictException('仅草稿、已驳回或已下架的文章可编辑')
    }
    const column = await this.prisma.articleColumn.findUnique({ where: { id: payload.columnId } })
    if (!column) throw new NotFoundException('所属栏目不存在')

    await this.prisma.article.update({
      where: { id },
      data: {
        title: payload.title,
        columnId: column.id,
        columnName: column.name,
        summary: payload.summary,
        tags: payload.tags,
      },
    })
    return { code: 0 }
  }

  async submitArticle(id: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article) throw new NotFoundException('文章不存在')
    if (article.status !== 'draft' && article.status !== 'rejected' && article.status !== 'withdrawn') {
      throw new ConflictException('仅草稿、已驳回或已下架的文章可提交审核')
    }
    await this.prisma.article.update({
      where: { id },
      data: { status: 'pending', rejectedReason: null },
    })
    return { code: 0 }
  }

  async reviewArticle(id: string, dto: ReviewArticleDto, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article) throw new NotFoundException('文章不存在')
    if (article.status !== 'pending') throw new ConflictException('仅待审核文章可审批')
    const comment = (dto.comment ?? '').trim()
    if (dto.status === 'rejected' && !comment) throw new BadRequestException('请填写驳回原因')

    await this.prisma.article.update({
      where: { id },
      data:
        dto.status === 'approved'
          ? { status: 'published', publishedAt: formatNow() }
          : { status: 'rejected', rejectedReason: comment },
    })

    await this.audit.record({
      module: '内容管理',
      action: dto.status === 'approved' ? '文章审核通过' : '文章驳回',
      target: `${article.id} · ${article.title}`,
      detail: comment || undefined,
      operator,
    })
    return { code: 0 }
  }

  async withdrawArticle(id: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article) throw new NotFoundException('文章不存在')
    if (article.status !== 'published') throw new ConflictException('仅已发布文章可下架')
    await this.prisma.article.update({ where: { id }, data: { status: 'withdrawn' } })
    return { code: 0 }
  }

  /* ---------- 栏目管理 ---------- */

  async columns(): Promise<ColumnDto[]> {
    const [columns, counts] = await Promise.all([
      this.prisma.articleColumn.findMany({ orderBy: { sort: 'asc' } }),
      this.prisma.article.groupBy({ by: ['columnId'], _count: { _all: true } }),
    ])
    const countMap = new Map(counts.map((c) => [c.columnId, c._count._all]))
    return columns.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      sort: c.sort,
      status: c.status,
      createdAt: c.createdAt,
      articleCount: countMap.get(c.id) ?? 0,
    }))
  }

  async createColumn(payload: ColumnPayloadDto): Promise<Record<string, unknown>> {
    const name = payload.name.trim()
    const dup = await this.prisma.articleColumn.findFirst({ where: { name } })
    if (dup) throw new ConflictException('栏目名称已存在')
    const column = await this.prisma.articleColumn.create({
      data: {
        id: await this.ids.next('CL'),
        name: payload.name,
        description: payload.description,
        sort: payload.sort,
        status: 'enabled',
        createdAt: formatToday(),
      },
    })
    return {
      id: column.id,
      name: column.name,
      description: column.description,
      sort: column.sort,
      status: column.status,
      createdAt: column.createdAt,
    }
  }

  async updateColumn(id: string, payload: ColumnPayloadDto): Promise<{ code: number }> {
    const column = await this.prisma.articleColumn.findUnique({ where: { id } })
    if (!column) throw new NotFoundException('栏目不存在')
    const name = payload.name.trim()
    const dup = await this.prisma.articleColumn.findFirst({
      where: { name, id: { not: id } },
    })
    if (dup) throw new ConflictException('栏目名称已存在')

    await this.prisma.articleColumn.update({
      where: { id },
      data: { name: payload.name, description: payload.description, sort: payload.sort },
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
    await this.prisma.articleColumn.update({
      where: { id },
      data: { status: column.status === 'enabled' ? 'disabled' : 'enabled' },
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
    if (request.status !== 'pending') throw new ConflictException('该申请已处理，请勿重复审批')

    const comment = (dto.comment ?? '').trim()

    /* 企业目标联动（先校验目标存在，避免写入后联动失败的部分状态） */
    if (request.targetType === 'enterprise' && request.targetId) {
      const ent = await this.prisma.enterprise.findUnique({ where: { id: request.targetId } })
      if (!ent) throw new NotFoundException('企业不存在')
    }

    const record: ApprovalRecord = {
      step: '管理员审批',
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
