import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma, UserIdentity } from '@prisma/client'
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
  imageUrl?: string
  link?: string
}

export interface HomeEventCardDto {
  id: string
  title: string
  type: string
  startTime: string
  location: string
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
  carouselEnabled: boolean
  banners: HomeBannerDto[]
  hotEvents: HomeEventCardDto[]
  latestDemands: HomeDemandCardDto[]
  topArticles: HomeArticleCardDto[]
  announcements: HomeAnnouncementDto[]
}

/* 首页聚合（M2-R R2 GET /api/app/home，@Public 或登录皆可）：
 * 站点信息 + 置顶公告（有效期内，全局仅一条）+ 运营 banner 位 + 精选活动/最新需求/置顶文章 + 未读数。
 * banner 运营位由系统开关和 HomeBanner 配置共同控制；未读数复用 notices 表（登录时）。
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
    const carouselEnabled = Boolean((config as (typeof config & { homeCarouselOpen?: boolean }) | null)?.homeCarouselOpen)

    const [announcements, banners, events, demands, articles, unread, identities] = await Promise.all([
      this.prisma.announcement.findMany({
        /* 首页顶部公告条只消费「已开启置顶」的一条（全局唯一；全关则不下发） */
        where: { status: 'published', pinned: true, deletedAt: null, OR: [{ expireAt: null }, { expireAt: { gt: nowStr } }] },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 1,
      }),
      carouselEnabled
        ? this.homeBanners.findMany({ where: { enabled: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] })
        : Promise.resolve([]),
      this.prisma.communityEvent.findMany({
        where: { status: 'published', deletedAt: null, endTime: { gt: nowTime } },
        orderBy: { startTime: 'asc' },
        take: 12,
      }),
      this.prisma.demand.findMany({
        where: { status: 'published', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
      this.prisma.article.findMany({
        where: { status: 'published', deletedAt: null },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: 3,
      }),
      uid
        ? this.prisma.userNotification.count({ where: { userId: uid, read: false } })
        : Promise.resolve(0),
      uid ? this.loadIdentities(uid) : Promise.resolve([]),
    ])

    /* 首页热门活动同样按可见范围过滤：取 12 条候选，过滤后取前 3 */
    const hotEvents = events
      .filter((e) => this.scopeMatches(e.visibilityIdentities, e.visibilityLevels, identities))
      .slice(0, 3)
    /* 最新需求同样按可见范围过滤：取 12 条候选，过滤后取前 3 */
    const visibleDemands = demands
      .filter((d) => this.scopeMatches(d.visibilityIdentities, d.visibilityLevels, identities))
      .slice(0, 3)
    const responseCounts = await this.countResponses(visibleDemands.map((d) => d.id))
    const categoryLabels = await this.resolveCategoryLabels([...new Set(visibleDemands.map((d) => d.category))])

    return {
      siteName: config?.siteName ?? '聚屿社区',
      siteSlogan: config?.siteSlogan ?? '',
      noticesUnread: unread,
      carouselEnabled,
      banners: banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        subtitle: banner.subtitle,
        imageUrl: banner.imageUrl ?? undefined,
        link: banner.link ?? undefined,
      })),
      hotEvents: hotEvents.map((e) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        startTime: e.startTime,
        location: e.location,
        capacity: e.capacity,
      })),
      latestDemands: visibleDemands.map((d) => {
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
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        at: a.publishedAt,
        pinned: a.pinned || undefined,
      })),
    }
  }

  /* ---------- 私有辅助 ---------- */

  private get homeBanners(): {
    findMany(args: {
      where: { enabled: boolean }
      orderBy: Array<Record<string, 'asc' | 'desc'>>
    }): Promise<Array<{ id: string; title: string; subtitle: string; imageUrl: string | null; link: string | null }>>
  } {
    return (this.prisma as unknown as { homeBanner: AppHomeService['homeBanners'] }).homeBanner
  }

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

  /** 取用户身份集（type + level），供活动可见范围过滤 */
  private async loadIdentities(uid: string): Promise<Pick<UserIdentity, 'type' | 'level'>[]> {
    return this.prisma.userIdentity.findMany({
      where: { userId: uid },
      select: { type: true, level: true },
    })
  }

  /** 范围过滤：按「单个身份」联合判定（类型命中且等级命中），多个身份取并集；两组都为空 = 不限 */
  private scopeMatches(
    identityTypes: string[],
    levels: string[],
    identities: Array<{ type: string; level: number | null }>,
  ): boolean {
    if (identityTypes.length === 0 && levels.length === 0) return true
    return identities.some(
      (i) =>
        (identityTypes.length === 0 || identityTypes.includes(i.type)) &&
        (levels.length === 0 || (i.level != null && levels.includes(String(i.level)))),
    )
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
