import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'

/** 首页公告（对齐客户端 HomeAnnouncement） */
export interface HomeAnnouncementDto {
  id: string
  title: string
  content: string
  at: string
  pinned?: boolean
}

/** 首页轮播（对齐客户端 HomeBanner） */
export interface HomeBannerDto {
  id: string
  title: string
  subtitle: string
}

export interface HomeEventCardDto {
  id: string
  title: string
  type: string
  startTime: string
  location: string
  enrolled: number
  capacity: number
}

export interface HomeDemandCardDto {
  id: string
  title: string
  categoryLabel: string
  publisherName: string
  publisherIdentity: string
  deliverBy?: string
  deadline?: string
  responseCount: number
}

export interface HomeArticleCardDto {
  id: string
  title: string
  columnLabel: string
  publishedAt: string
  views: number
}

/** 首页聚合（对齐客户端 HomeFeed） */
export interface HomeFeedDto {
  siteName: string
  siteSlogan: string
  noticesUnread: number
  banners: HomeBannerDto[]
  hotEvents: HomeEventCardDto[]
  latestDemands: HomeDemandCardDto[]
  topArticles: HomeArticleCardDto[]
  announcements: HomeAnnouncementDto[]
}

/* 首页聚合（M2-R R2 GET /api/app/home，@Public 或登录皆可）：
 * 站点信息 + 公告（有效期内、置顶优先取 2）+ 运营 banner 位 + 精选活动/最新需求/置顶文章 + 未读数。
 * banner 运营位 R2 取自置顶公告的简化（无图则 title 占位）；未读数复用 notices 表（登录时）。
 * 该端点 @Public 绕过 AppJwtGuard，未读数通过可选 Bearer 令牌 best-effort 判定。 */
@Injectable()
export class AppHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async home(authorization?: string): Promise<HomeFeedDto> {
    const uid = await this.resolveOptionalUid(authorization)
    const now = new Date()
    const nowStr = formatDate(now)
    const nowTime = `${nowStr} ${pad(now.getHours())}:${pad(now.getMinutes())}`

    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })

    const [announcements, events, demands, articles, unread] = await Promise.all([
      this.prisma.announcement.findMany({
        where: { status: 'published', deletedAt: null, OR: [{ expireAt: null }, { expireAt: { gt: nowStr } }] },
      }),
      this.prisma.communityEvent.findMany({
        where: { status: 'published', deletedAt: null, endTime: { gt: nowTime } },
        orderBy: { startTime: 'asc' },
        take: 6,
      }),
      this.prisma.demand.findMany({
        where: { status: 'published', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      this.prisma.article.findMany({
        where: { status: 'published', deletedAt: null },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
      uid
        ? this.prisma.userNotification.count({ where: { userId: uid, read: false, archived: false } })
        : Promise.resolve(0),
    ])

    const hotEvents = events.slice(0, 3)
    const enrollmentCounts = await this.countEnrollments(hotEvents.map((e) => e.id))
    const responseCounts = await this.countResponses(demands.map((d) => d.id))
    const categoryLabels = await this.resolveCategoryLabels([...new Set(demands.map((d) => d.category))])

    /* 榜单排序：置顶优先，其次时间倒序；公告取前 2；运营位取置顶公告 3 条 */
    const sortedAnnouncements = [...announcements].sort(
      (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.publishedAt.localeCompare(a.publishedAt),
    )
    const pinned = announcements.filter((a) => a.pinned)
    const banners = pinned.slice(0, 3).map((a) => ({ id: a.id, title: a.title, subtitle: '' }))

    return {
      siteName: config?.siteName ?? '聚屿社区',
      siteSlogan: config?.siteSlogan ?? '',
      noticesUnread: unread,
      banners,
      hotEvents: hotEvents.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        startTime: e.startTime,
        location: e.location,
        enrolled: enrollmentCounts.get(e.id) ?? 0,
        capacity: e.capacity,
      })),
      latestDemands: demands.map((d) => {
        const card: HomeDemandCardDto = {
          id: d.id,
          title: d.title,
          categoryLabel: categoryLabels.get(d.category) ?? d.category,
          publisherName: d.publisherName,
          publisherIdentity: publisherIdentityOf(d.publisherIdentity),
          responseCount: responseCounts.get(d.id) ?? 0,
        }
        if (d.deliverBy) card.deliverBy = d.deliverBy
        else if (d.deadline) card.deadline = d.deadline
        return card
      }),
      topArticles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        columnLabel: a.columnName,
        publishedAt: a.publishedAt ?? a.createdAt,
        views: a.views,
      })),
      announcements: sortedAnnouncements.slice(0, 2).map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        at: a.publishedAt,
        pinned: a.pinned || undefined,
      })),
    }
  }

  /* ---------- 私有辅助 ---------- */

  /** @Public 端点：可选令牌判定登录 uid（best-effort，失败按未登录） */
  private async resolveOptionalUid(authorization?: string): Promise<string | undefined> {
    if (!authorization?.startsWith('Bearer ')) return undefined
    const token = authorization.slice(7)
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; scope: string }>(token)
      return payload.scope === 'app' ? payload.sub : undefined
    } catch {
      return undefined
    }
  }

  private async countEnrollments(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (!ids.length) return map
    const rows = await this.prisma.eventEnrollment.groupBy({
      by: ['eventId'],
      where: { eventId: { in: ids }, status: 'approved' },
      _count: { _all: true },
    })
    for (const r of rows) map.set(r.eventId, r._count._all)
    return map
  }

  private async countResponses(ids: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    if (!ids.length) return map
    const rows = await this.prisma.demandRespondent.groupBy({
      by: ['demandId'],
      where: { demandId: { in: ids } },
      _count: { _all: true },
    })
    for (const r of rows) map.set(r.demandId, r._count._all)
    return map
  }

  private async resolveCategoryLabels(codes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    if (!codes.length) return map
    const cols = codes.map((code) => ({ type: 'demand_category', code }))
    const entries = await this.prisma.dictEntry.findMany({
      where: { OR: cols as Prisma.DictEntryTypeCodeCompoundUniqueInput[] },
    })
    for (const e of entries) map.set(e.code, e.label)
    return map
  }
}

function publisherIdentityOf(json: Prisma.JsonValue | null): string {
  if (!json || typeof json !== 'object') return 'individual'
  return String((json as { type?: unknown }).type ?? 'individual')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}