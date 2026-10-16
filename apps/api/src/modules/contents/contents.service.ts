import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Article } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { AuditService } from '../../common/audit/audit.service'
import { NotificationService } from '../../common/notify/notification.service'
import { formatNow, formatToday } from '../../common/utils/time'
import { normalizeScheduledAt } from '../../common/utils/schedule-time'
import { sanitizeHtml } from '../../common/utils/sanitize-html'
import { toIdentityDto } from '../users/user.mapper'
import { PointsEngineService } from '../../common/engine/points-engine/points-engine.service'
import type { ArticlePayloadDto } from './dto/article-payload.dto'
import type { ReviewArticleDto } from './dto/review-article.dto'
import type { ScheduleArticleDto } from './dto/schedule-article.dto'
import type { ColumnPayloadDto } from './dto/column-payload.dto'
import type { QueryArticlesDto } from './dto/query-articles.dto'
import { articleTakedowns, type ArticleWithComments } from './article-integration'
import type { PageQueryDto } from '../../common/dto/page-query.dto'

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

/** 列表行（omit 正文）与详情行的联合形状：content 仅详情/编辑路径加载 */
type ArticleRow = Omit<Article, 'content'> & { content?: string }

/* Prisma 行 → Article 形状：栏目以数组契约承载单选；可空字段缺失时省略（对齐 undefined）；
 * 正文仅在加载时返回（列表查询 omit content，列表不依赖正文） */
function toArticleDto(a: ArticleRow | ArticleWithComments): Record<string, unknown> {
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
    tags: a.tags,
    commentsEnabled: 'commentsEnabled' in a ? a.commentsEnabled : true,
    createdAt: a.createdAt,
  }
  if (a.content !== undefined) dto.content = a.content
  if (a.scheduledAt != null) dto.scheduledAt = a.scheduledAt
  if (a.publishedAt != null) dto.publishedAt = a.publishedAt
  if (a.rejectedReason != null) dto.rejectedReason = a.rejectedReason
  return dto
}

/* 内容管理（wiki-backend.md §7.14/§8.1/§8.9）：
 * 文章分来源 channel：official 社区自行发布（新增即待发布）/ submitted 用户投稿（新增即待审核）；
 * 状态机 pending →(review approved)→ pending_release | (rejected)→ rejected；
 *   pending_release →(publish)→ published | (schedule)→ scheduled；scheduled →(cancel)→ pending_release | (publish)→ published；
 *   published →(staff takedown)→ closed →(restore)→ published；pending/rejected/pending_release/closed →(archive)→ 软删；
 * 栏目改名 → 级联刷新文章 columnName 快照。 */
@Injectable()
export class ContentsService {
  /** 已经发布过、尚未归档的文章：包含已下架文章；汇总在数据库完成，无数量截断。 */
  async readStats(query: PageQueryDto) {
    const where: Prisma.ArticleWhereInput = { deletedAt: null, publishedAt: { not: null } }
    const [aggregate, rows] = await Promise.all([
      this.prisma.article.aggregate({ where, _count: { _all: true }, _sum: { views: true }, _max: { views: true } }),
      this.prisma.article.findMany({ where, omit: { content: true }, orderBy: [{ views: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ])
    const total = aggregate._count._all
    const views = aggregate._sum.views ?? 0
    return { list: rows.map(toArticleDto), total,
      summary: { totalViews: views, articleCount: total, averageViews: total ? Math.round(views / total) : 0, topViews: aggregate._max.views ?? 0 } }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly notify: NotificationService,
    private readonly points: PointsEngineService,
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
    if (query.status) where.status = { in: query.status }
    if (query.channel) where.channel = query.channel

    /* 列表查询 omit 正文（content 体积大，列表不依赖；编辑/详情按 id 单独拉取），
     * 显著降低列表请求的库读取、内存占用与响应体大小 */
    const rows = await this.prisma.article.findMany({ where, omit: { content: true } })

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

  async article(id: string): Promise<Record<string, unknown>> {
    const article = await this.prisma.article.findFirst({ where: { id, deletedAt: null } })
    if (!article) throw new NotFoundException('文章不存在')
    const takedowns = await articleTakedowns(this.prisma).findMany({ where: { articleId: id }, orderBy: { id: 'desc' } })
    return { ...toArticleDto(article), takedowns }
  }

  /** 文章评论列表（后台治理视图：含发表身份快照，按时间升序） */
  async articleComments(articleId: string): Promise<Record<string, unknown>> {
    const article = await this.prisma.article.findFirst({ where: { id: articleId, deletedAt: null }, select: { id: true, title: true, commentsEnabled: true } })
    if (!article) throw new NotFoundException('文章不存在')
    const rows = await this.prisma.articleComment.findMany({
      where: { articleId },
      include: { user: { select: { nickname: true, realName: true, avatar: true } } },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    })
    return {
      articleId,
      commentsEnabled: article.commentsEnabled,
      list: rows.map((row) => {
        const identity = row.identity as { type?: string; enterpriseName?: string; organizationName?: string } | null
        return {
          id: String(row.id),
          articleId: row.articleId,
          uid: row.userId,
          userName: row.userName,
          nickname: row.user.nickname,
          realName: row.user.realName ?? undefined,
          avatar: row.user.avatar ?? undefined,
          content: row.content,
          at: row.at,
          identityType: identity?.type ?? 'individual',
          identityName: identity?.enterpriseName ?? identity?.organizationName ?? undefined,
        }
      }),
    }
  }

  /** 治理性删除评论（物理删除 + 计数回落 + 审计；填写原因时站内信通知评论作者）。
   * articleId 来自路径参数：评论必须属于该文章，避免命中其它文章下的评论 */
  async removeArticleComment(
    articleId: string,
    commentId: string,
    reason: string | undefined,
    operator: string,
  ): Promise<{ code: number }> {
    const id = Number.parseInt(commentId, 10)
    if (!Number.isInteger(id) || id <= 0) throw new NotFoundException('评论不存在或已删除')
    const comment = await this.prisma.articleComment.findUnique({ where: { id } })
    if (!comment || comment.articleId !== articleId) throw new NotFoundException('评论不存在或已删除')
    await this.prisma.$transaction(async (tx) => {
      /* 通知需在删除前读取评论作者（notifyContentTakedown 依赖评论行） */
      if (reason?.trim()) {
        await this.notify.notifyContentTakedown(tx, 'comment', String(id), reason.trim())
      }
      await tx.articleComment.delete({ where: { id } })
      await tx.article.updateMany({ where: { id: comment.articleId, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } })
    })
    await this.audit.record({
      module: '内容管理',
      action: '删除评论',
      target: `评论 ${id} · ${comment.userName}`,
      detail: reason?.trim() || undefined,
      operator,
    })
    return { code: 0 }
  }

  async createArticle(payload: ArticlePayloadDto, operator: string): Promise<Record<string, unknown>> {
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
        commentsEnabled: payload.commentsEnabled ?? true,
        createdAt: formatNow(),
        rejectedReason: null,
      } as unknown as Prisma.ArticleUncheckedCreateInput,
    })
    await this.bindAssets(article.content, channel, article.id)
    await this.audit.record({
      module: '内容管理',
      action: channel === 'submitted' ? '代发布用户投稿' : '新增文章',
      target: `${article.id} · ${article.title}`,
      detail: `栏目 ${column.name} · 状态 ${article.status}`,
      operator,
    })
    return toArticleDto(article)
  }

  async updateArticle(id: string, payload: ArticlePayloadDto, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'pending_release' && article.status !== 'scheduled' && article.status !== 'rejected') {
      throw new ConflictException('仅待发布、定时发布中或已驳回的文章可编辑')
    }

    return this.applyArticleUpdate(article, payload, operator)
  }

  async updateSubmissionArticle(id: string, payload: ArticlePayloadDto, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.channel !== 'submitted') throw new ConflictException('仅用户投稿可在投稿内容中编辑')
    if (article.status !== 'pending_release') throw new ConflictException('仅待发布的投稿可编辑')

    return this.applyArticleUpdate(article, payload, operator)
  }

  private async applyArticleUpdate(article: Article, payload: ArticlePayloadDto, operator: string): Promise<{ code: number }> {
    const columnId = payload.columnIds?.[0]
    if (!columnId) throw new BadRequestException('请选择所属栏目')
    const column = await this.prisma.articleColumn.findUnique({ where: { id: columnId } })
    if (!column) throw new NotFoundException('所属栏目不存在')

    /* 被驳回的投稿允许修改后重新进入待审核；待发布/定时发布中的自主文章保持原状态 */
    const nextStatus = article.status === 'rejected' ? 'pending' : article.status
    const content = sanitizeHtml(payload.content)

    await this.prisma.article.update({
      where: { id: article.id },
      data: {
        title: payload.title,
        columnId: column.id,
        columnName: column.name,
        summary: payload.summary,
        content,
        tags: payload.tags,
        commentsEnabled: payload.commentsEnabled ?? true,
        status: nextStatus,
        rejectedReason: null,
        ...(nextStatus !== 'scheduled' ? { scheduledAt: null } : {}),
      } as unknown as Prisma.ArticleUncheckedUpdateInput,
    })
    await this.bindAssets(content, article.channel, article.id)
    await this.audit.record({
      module: '内容管理',
      action: '编辑文章',
      target: `${article.id} · ${payload.title}`,
      before: { title: article.title, columnName: article.columnName, status: article.status },
      after: { title: payload.title, columnName: column.name, status: nextStatus },
      operator,
    })
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

    if (article.authorId) {
      await this.notify.pushNotice(article.authorId, {
        type: 'content',
        title: dto.status === 'approved' ? '投稿已通过审核' : '投稿未通过审核',
        content:
          dto.status === 'approved'
            ? `您的投稿「${article.title}」已通过审核，发布后将公开展示。`
            : `您的投稿「${article.title}」未通过审核：${comment}`,
        link: '/me/articles',
      })
    }

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
    if (article.channel === 'submitted' && article.authorId) {
      await this.points.issuePoints(article.authorId, 'article_accepted', '投稿审核通过并发布', `article_accepted:${article.id}`)
    }
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
    /* 统一校验与规范化：格式合法 + 归一为 YYYY-MM-DD HH:mm（列宽 16）+ 晚于当前时间，
     * 避免非法/超长取值被调度任务按字符串 lte 判定为「立即发布」或溢出列宽报 500 */
    const scheduledAt = normalizeScheduledAt(dto.scheduledAt)

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

  /** 管理员下架：已发布 → 已关闭，并持久记录下架原因。 */
  async withdrawArticle(id: string, operator: string, takedownReason?: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'published') throw new ConflictException('仅已发布的文章可下架')
    const now = formatNow()
    const reason = takedownReason?.trim() || null
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.article.updateMany({
        where: { id, deletedAt: null, status: 'published' },
        data: { status: 'closed', scheduledAt: null, archivableAt: now },
      })
      if (changed.count !== 1) throw new ConflictException('文章状态已变化，请刷新后重试')
      await articleTakedowns(tx).create({
        data: { articleId: id, source: 'manual', reason, takenDownAt: now, takenDownBy: operator },
      })
      await this.notify.notifyContentTakedown(tx, 'article', id, takedownReason)
    })
    await this.audit.record({
      module: '内容管理',
      action: '文章下架',
      target: `${article.id} · ${article.title}`,
      detail: takedownReason?.trim() || undefined,
      before: { status: article.status },
      after: { status: 'closed' },
      operator,
    })
    return { code: 0 }
  }

  /** 恢复管理员下架的文章。 */
  async restoreArticle(id: string, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (article.status !== 'closed') throw new ConflictException('仅已关闭的文章可恢复')
    const now = formatNow()
    await this.prisma.$transaction(async (tx) => {
      const takedown = await articleTakedowns(tx).findFirst({
        where: { articleId: id, source: 'manual', restoredAt: null },
        orderBy: { id: 'desc' },
      })
      if (!takedown) throw new ConflictException('未找到可恢复的下架记录，请刷新后重试')
      const changed = await tx.article.updateMany({
        where: { id, deletedAt: null, status: 'closed' },
        data: { status: 'published', publishedAt: article.publishedAt ?? now, archivableAt: null },
      })
      if (changed.count !== 1) throw new ConflictException('文章状态已变化，请刷新后重试')
      const restored = await articleTakedowns(tx).updateMany({
        where: { id: takedown.id, restoredAt: null },
        data: { restoredAt: now, restoredBy: operator },
      })
      if (restored.count !== 1) throw new ConflictException('文章下架记录已恢复')
    })
    await this.audit.record({
      module: '内容管理',
      action: '恢复文章',
      target: `${article.id} · ${article.title}`,
      before: { status: article.status },
      after: { status: 'published' },
      operator,
    })
    return { code: 0 }
  }

  /** 归档文章（软删）：待审核、已驳回、待发布和已关闭可归档。 */
  async deleteArticle(id: string, operator: string): Promise<{ code: number }> {
    const article = await this.prisma.article.findUnique({ where: { id } })
    if (!article || article.deletedAt) throw new NotFoundException('文章不存在')
    if (!['pending', 'rejected', 'pending_release', 'closed'].includes(article.status)) {
      throw new ConflictException('仅待审核、已驳回、待发布或已关闭的文章可归档')
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

}
