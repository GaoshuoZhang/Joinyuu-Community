import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Article, ArticleColumn, Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import { sanitizeHtml } from '../../../common/utils/sanitize-html'
import { formatNow } from '../../../common/utils/time'
import type { CreateArticleDto } from './dto/create-article.dto'
import { JwtService } from '@nestjs/jwt'
import { assertEnterprisePermission } from '../../../common/enterprise/enterprise-permission'
import { consumePublishingLimit } from '../../../common/enterprise/publishing-limits'
import type { ArticleWithComments } from '../../contents/article-integration'

/** 栏目 DTO（对齐客户端 ArticleColumn：code/label） */
export interface ArticleColumnDto {
  code: string
  label: string
}

/** 文章 DTO（对齐客户端 Article：含 likeCount/liked；content 详情与列表均下发） */
export interface ArticleDto {
  id: string
  title: string
  columnLabel: string
  authorName: string
  publishedAt: string
  views: number
  summary: string
  coverUrl?: string
  content: string
  likeCount: number
  commentCount: number
  commentsEnabled: boolean
  liked?: boolean
}

/** 我的投稿 DTO（对齐客户端 MySubmittedArticle） */
export interface MySubmittedArticleDto {
  id: string
  title: string
  columnLabel: string
  status: string
  submittedAt: string
  rejectReason?: string
}

export interface MySubmittedArticleDetailDto extends MySubmittedArticleDto {
  authorName: string
  content: string
  summary: string
  tags: string[]
  asIdentity?: string
  asEnterpriseId?: string
  identityName?: string
  scheduledAt?: string
  publishedAt?: string
}

/** 回填载荷（对齐客户端 ArticleCreatePayload） */
export interface ArticlePayloadDto {
  title: string
  columnCode: string
  asIdentity?: string
  asEnterpriseId?: string
  coverUrl?: string
  content: string
}

/** 仅存点赞的作者身份快照关键字段 */
interface Snapshot {
  type?: string
  enterpriseId?: string
  enterpriseName?: string
}

/* 内容与投稿（M2-R R2 /api/app/contents 与 /api/app/articles、me/articles）：
 * 浏览 published 文章（详情浏览量 +1、返回点赞/评论计数）、栏目、投稿（SU 前缀、channel=submitted、status=pending）、
 * 我的投稿（撤回/重提/回填）、点赞切换（Favorite targetType='article' 存我的点赞 + Article.likeCount 事务增减）。
 * 评论使用 ArticleComment 表并在事务内维护 Article.commentCount；R3 起评论列表叠加用户屏蔽过滤。 */
@Injectable()
export class AppContentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly jwt: JwtService,
  ) {}

  /** 栏目列表（enabled 且非系统保留；对齐客户端按 code/label 输出） */
  async articleColumns(): Promise<ArticleColumnDto[]> {
    const rows = await this.prisma.articleColumn.findMany({
      where: { status: 'enabled', system: false },
      orderBy: { sort: 'asc' },
    })
    return rows.map((c) => ({ code: c.id, label: c.name }))
  }

  /** published 文章列表（栏目/关键词过滤，publishedAt 倒序） */
  async articles(columnId?: string, keyword?: string, authorization?: string): Promise<ArticleDto[]> {
    const viewerUid = await this.optionalUid(authorization)
    const blockedUids = await this.blockedUids(viewerUid)
    const where: Prisma.ArticleWhereInput = { status: 'published', deletedAt: null }
    if (blockedUids.length) where.authorId = { notIn: blockedUids }
    if (columnId) where.columnId = columnId
    if (keyword) where.OR = [{ title: { contains: keyword } }, { summary: { contains: keyword } }]
    const rows = await this.prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map((a) => toArticleDto(a, false))
  }

  /** 文章详情：published；浏览量 +1；返回 likeCount/commentCount/myLiked */
  async articleDetail(id: string, authorization?: string): Promise<ArticleDto> {
    const uid = await this.optionalUid(authorization)
    const blockedUids = await this.blockedUids(uid)
    const article = await this.prisma.article.findFirst({
      where: { id, status: 'published', deletedAt: null, ...(blockedUids.length ? { authorId: { notIn: blockedUids } } : {}) },
    })
    if (!article) throw new NotFoundException('文章不存在')
    await this.prisma.article.updateMany({ where: { id, status: 'published' }, data: { views: { increment: 1 } } })
    const liked = uid ? await this.isLiked(uid, 'article', id) : false
    return toArticleDto({ ...article, views: article.views + 1 }, true, liked)
  }

  /** 投稿：channel=submitted、status=pending、SU 前缀、作者身份快照、代企业校验 article_submit */
  async createArticle(user: { uid: string; name: string }, dto: CreateArticleDto): Promise<{ id: string }> {
    const title = dto.title?.trim()
    const content = dto.content ?? ''
    if (!title) throw new BadRequestException('请填写标题')
    if (!content.trim()) throw new BadRequestException('请填写正文内容')

    const column = await this.resolveArticleColumn(dto.columnId, dto.columnCode)
    if (!column) throw new BadRequestException('请选择有效的投稿栏目')

    let snapshot: Snapshot = { type: dto.asIdentity || 'individual' }
    if (dto.asEnterpriseId) {
      const enterprise = await this.prisma.enterprise.findUnique({ where: { id: dto.asEnterpriseId } })
      if (!enterprise) throw new NotFoundException('企业不存在')
      await assertEnterprisePermission(this.prisma, user.uid, dto.asEnterpriseId, 'article_submit')
      snapshot = { type: 'community_enterprise', enterpriseId: enterprise.id, enterpriseName: enterprise.name }
    } else if (dto.asIdentity === 'community_enterprise') {
      throw new BadRequestException('请选择要代表的社区企业')
    }

    const id = await this.ids.next('SU')
    await this.prisma.$transaction(async tx => {
      await consumePublishingLimit(tx, user.uid, 'article_publish', { identityType: snapshot.type, enterpriseId: snapshot.enterpriseId })
      await tx.article.create({
      data: {
        id,
        title,
        channel: 'submitted',
        columnId: column.id,
        columnName: column.name,
        authorId: user.uid,
        authorName: user.name,
        authorIdentity: snapshot as unknown as Prisma.InputJsonValue,
        status: 'pending',
        content: sanitizeHtml(content),
        summary: (dto.summary ?? '').trim().slice(0, 255),
        tags: dto.tags ?? [],
        commentsEnabled: true,
        createdAt: formatNow(),
      } as unknown as Prisma.ArticleUncheckedCreateInput,
      })
    })
    return { id }
  }

  /** 我的投稿（全状态；含驳回原因） */
  async myArticles(uid: string): Promise<MySubmittedArticleDto[]> {
    const rows = await this.prisma.article.findMany({
      where: { authorId: uid, channel: 'submitted', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toMySubmittedArticleDto)
  }

  /** 投稿详情不要求 published，按 authorId + submitted channel 校验归属。 */
  async myArticleDetail(uid: string, id: string): Promise<MySubmittedArticleDetailDto> {
    const article = await this.mine(uid, id)
    const snap = (article.authorIdentity as unknown as Snapshot | null) ?? {}
    return {
      ...toMySubmittedArticleDto(article),
      authorName: article.authorName,
      content: article.content,
      summary: article.summary,
      tags: article.tags,
      ...(snap.type ? { asIdentity: snap.type } : {}),
      ...(snap.enterpriseId ? { asEnterpriseId: snap.enterpriseId } : {}),
      ...(snap.enterpriseName ? { identityName: snap.enterpriseName } : {}),
      ...(article.scheduledAt ? { scheduledAt: article.scheduledAt } : {}),
      ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}),
    }
  }

  /** 撤回审核中的投稿：pending → withdrawn */
  async withdrawArticle(uid: string, id: string): Promise<{ code: number }> {
    const article = await this.mine(uid, id)
    if (article.status !== 'pending') throw new ConflictException('仅审核中的投稿可撤回')
    await this.prisma.article.update({ where: { id }, data: { status: 'withdrawn' } })
    return { code: 0 }
  }

  /** 修改重提：withdrawn/rejected → pending（保留编号，覆盖内容与栏目） */
  async resubmitArticle(uid: string, id: string, dto: CreateArticleDto): Promise<{ code: number }> {
    const article = await this.mine(uid, id)
    const identity = article.authorIdentity as Snapshot | null
    if (identity?.enterpriseId) await assertEnterprisePermission(this.prisma, uid, identity.enterpriseId, 'article_submit')
    if (article.status !== 'withdrawn' && article.status !== 'rejected') {
      throw new ConflictException('仅已驳回或已撤回的投稿可修改重提')
    }
    const column = await this.resolveArticleColumn(dto.columnId, dto.columnCode)
    if (!column) throw new BadRequestException('请选择有效的投稿栏目')
    await this.prisma.$transaction(async tx => {
      await consumePublishingLimit(tx, uid, 'article_publish', { identityType: identity?.type, enterpriseId: identity?.enterpriseId })
      const changed = await tx.article.updateMany({
      where: { id, status: { in: ['withdrawn', 'rejected'] }, deletedAt: null },
      data: {
        title: dto.title?.trim(),
        columnId: column.id,
        columnName: column.name,
        content: sanitizeHtml(dto.content ?? ''),
        summary: (dto.summary ?? '').trim().slice(0, 255),
        tags: dto.tags ?? [],
        rejectedReason: null,
        status: 'pending',
      },
      })
      if (changed.count !== 1) throw new ConflictException('投稿状态已变化，请刷新后重试')
    })
    return { code: 0 }
  }

  /** 回填原始投稿（驳回/撤回稿） */
  async articlePayload(uid: string, id: string): Promise<ArticlePayloadDto> {
    const article = await this.mine(uid, id)
    const snap = (article.authorIdentity as unknown as Snapshot | null) ?? {}
    const dto: ArticlePayloadDto = {
      title: article.title,
      columnCode: article.columnId,
      content: article.content,
    }
    if (snap.type) dto.asIdentity = snap.type
    if (snap.enterpriseId) dto.asEnterpriseId = snap.enterpriseId
    const cover = firstImage(article.content)
    if (cover) dto.coverUrl = cover
    return dto
  }

  /** 点赞切换：Favorite targetType='article' 幂等 + Article.likeCount 事务增减 */
  async toggleLike(uid: string, id: string): Promise<{ liked: boolean; likeCount: number }> {
    const article = await this.prisma.article.findFirst({
      where: { id, status: 'published', deletedAt: null },
    })
    if (!article) throw new NotFoundException('文章不存在')
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_targetType_targetId: { userId: uid, targetType: 'article', targetId: id } },
    })
    if (existing) {
      await this.prisma.$transaction([
        this.prisma.favorite.delete({
          where: { userId_targetType_targetId: { userId: uid, targetType: 'article', targetId: id } },
        }),
        this.prisma.article.updateMany({
          where: { id, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        }),
      ])
      return { liked: false, likeCount: Math.max(0, article.likeCount - 1) }
    }
    await this.prisma.$transaction([
      this.prisma.favorite.create({
        data: { userId: uid, targetType: 'article', targetId: id, createdAt: formatNow() },
      }),
      this.prisma.article.updateMany({ where: { id }, data: { likeCount: { increment: 1 } } }),
    ])
    return { liked: true, likeCount: article.likeCount + 1 }
  }

  /** 已发布文章评论列表；R3 屏蔽联动：登录态下排除「我屏蔽的用户」的评论（游客不过滤）。 */
  async articleComments(articleId: string, authorization?: string) {
    const article = await this.prisma.article.findFirst({
      where: { id: articleId, status: 'published', deletedAt: null },
      select: { id: true, commentsEnabled: true } as unknown as Prisma.ArticleSelect,
    })
    if (!article) throw new NotFoundException('文章不存在')
    if (!(article as unknown as { commentsEnabled: boolean }).commentsEnabled) throw new ConflictException('文章评论已关闭')
    const viewerUid = await this.optionalUid(authorization)
    const blockedUids = await this.blockedUids(viewerUid)
    const rows = await this.prisma.articleComment.findMany({
      where: blockedUids.length ? { articleId, userId: { notIn: blockedUids } } : { articleId },
      include: { user: { select: { avatar: true } } },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    })
    return rows.map((row) => {
      const identity = row.identity as { type?: string; enterpriseName?: string; organizationName?: string } | null
      return {
        id: String(row.id),
        articleId: row.articleId,
        uid: row.userId,
        authorName: row.userName,
        avatar: row.user.avatar ?? undefined,
        content: row.content,
        at: row.at,
        identityType: identity?.type ?? 'individual',
        identityName: identity?.enterpriseName ?? identity?.organizationName ?? undefined,
      }
    })
  }

  /** 发布评论并原子更新冗余计数；支持选择发表身份。 */
  async createArticleComment(
    uid: string,
    articleId: string,
    rawContent: string,
    identityInput?: { asIdentity?: string; asEnterpriseId?: string },
  ): Promise<{ id: string }> {
    const content = rawContent.trim()
    if (content.length < 2 || content.length > 200) throw new BadRequestException('评论需为 2-200 字')
    const [article, user] = await Promise.all([
      this.prisma.article.findFirst({ where: { id: articleId, status: 'published', deletedAt: null } }),
      this.prisma.user.findUnique({ where: { uid } }),
    ])
    if (!article) throw new NotFoundException('文章不存在')
    if (!(article as ArticleWithComments).commentsEnabled) throw new ConflictException('文章评论已关闭')
    if (!user) throw new NotFoundException('用户不存在')
    const identity = await this.commentIdentity(uid, identityInput?.asIdentity, identityInput?.asEnterpriseId)
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.articleComment.create({
        data: { articleId, userId: uid, userName: user.realName || user.nickname, content, at: formatNow(), identity },
      })
      await tx.article.update({ where: { id: articleId }, data: { commentCount: { increment: 1 } } })
      return row
    })
    return { id: String(created.id) }
  }

  /** 评论发表身份快照：按所选身份校验归属（企业评论要求已关联该企业） */
  private async commentIdentity(
    uid: string,
    asIdentity?: string,
    asEnterpriseId?: string,
  ): Promise<Prisma.InputJsonValue | undefined> {
    const requested = asIdentity ?? (asEnterpriseId ? 'community_enterprise' : 'individual')
    if (requested === 'community_enterprise') {
      if (!asEnterpriseId) throw new BadRequestException('请选择要代表的社区企业')
      const row = await this.prisma.userIdentity.findFirst({
        where: { userId: uid, type: 'community_enterprise', enterpriseId: asEnterpriseId },
      })
      if (!row) throw new BadRequestException('您暂未关联该身份')
      return { type: 'community_enterprise', enterpriseId: row.enterpriseId, enterpriseName: row.enterpriseName ?? undefined, title: '社区企业' }
    }
    if (requested === 'community_individual') {
      const row = await this.prisma.userIdentity.findFirst({ where: { userId: uid, type: 'community_individual' } })
      if (!row) throw new BadRequestException('您暂未关联该身份')
      return { type: 'community_individual', level: row.level ?? undefined }
    }
    if (requested === 'external_enterprise') {
      const row = await this.prisma.userIdentity.findFirst({ where: { userId: uid, type: 'external_enterprise' } })
      if (!row) throw new BadRequestException('您暂未关联该身份')
      return { type: 'external_enterprise', organizationName: row.enterpriseName ?? undefined, title: '合作企业' }
    }
    return { type: 'individual', title: '个人用户' }
  }

  /* ---------- 私有辅助 ---------- */

  private async isLiked(uid: string, targetType: string, targetId: string): Promise<boolean> {
    const fav = await this.prisma.favorite.findUnique({
      where: { userId_targetType_targetId: { userId: uid, targetType, targetId } },
    })
    return !!fav
  }

  private async optionalUid(authorization?: string): Promise<string | undefined> {
    if (!authorization?.startsWith('Bearer ')) return undefined
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; scope?: string }>(authorization.slice(7))
      return payload.scope === 'app' ? payload.sub : undefined
    } catch {
      return undefined
    }
  }

  private async blockedUids(uid?: string): Promise<string[]> {
    if (!uid) return []
    const rows = await this.prisma.userBlock.findMany({ where: { userId: uid }, select: { blockedUid: true } })
    return rows.map((row) => row.blockedUid)
  }

  private async mine(uid: string, id: string): Promise<Article> {
    const article = await this.prisma.article.findFirst({
      where: { id, authorId: uid, channel: 'submitted', deletedAt: null },
    })
    if (!article) throw new NotFoundException('投稿不存在')
    return article
  }

  private async resolveArticleColumn(columnId?: string, columnCode?: string): Promise<ArticleColumn | null> {
    const ids = [columnId, columnCode].filter((v): v is string => !!v)
    for (const cid of ids) {
      const column = await this.prisma.articleColumn.findFirst({ where: { id: cid, status: 'enabled' } })
      if (column) return column
    }
    return null
  }

}

function toArticleDto(a: Article | ArticleWithComments, includeLiked: boolean, liked?: boolean): ArticleDto {
  const dto: ArticleDto = {
    id: a.id,
    title: a.title,
    columnLabel: a.columnName,
    authorName: a.authorName,
    publishedAt: a.publishedAt ?? a.createdAt,
    views: a.views,
    summary: a.summary,
    content: a.content,
    likeCount: a.likeCount,
    commentCount: a.commentCount,
    commentsEnabled: 'commentsEnabled' in a ? a.commentsEnabled : true,
  }
  const cover = firstImage(a.content)
  if (cover) dto.coverUrl = cover
  if (includeLiked) dto.liked = liked ?? false
  return dto
}

function toMySubmittedArticleDto(a: Article): MySubmittedArticleDto {
  const dto: MySubmittedArticleDto = {
    id: a.id,
    title: a.title,
    columnLabel: a.columnName,
    status: a.status,
    submittedAt: a.createdAt,
  }
  if (a.rejectedReason) dto.rejectReason = a.rejectedReason
  return dto
}

/** 正文首个 <img src> 作为封面（schema 无封面列，R2 由正文推导） */
function firstImage(html: string): string | undefined {
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html)
  return m ? m[1] : undefined
}
