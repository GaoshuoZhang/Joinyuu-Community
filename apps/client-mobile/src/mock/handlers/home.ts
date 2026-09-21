import type { HomeFeed } from '@/types'
import { accountByUid, announcements, appConfig, articles, demands, events, homeBanners, noticesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { withLatency } from '@/mock/latency'
import { mockNowMs, parseMockStamp } from '@/mock/runtime'

/** 当前用户身份集（未登录按个人用户兜底，与其余 mock handler 同口径） */
function myIdentities(): { type: string; level?: number }[] {
  const uid = readPayload()?.sub
  const account = uid ? accountByUid(uid) : undefined
  return account?.identities ?? [{ type: 'individual' }]
}

/** 可见范围判定：与后端 scopeMatches 同口径（类型命中且等级命中，多身份取并集；两组为空=不限） */
function visibleTo(item: { visibilityIdentities: readonly string[]; visibilityLevels: readonly number[] }): boolean {
  if (item.visibilityIdentities.length === 0 && item.visibilityLevels.length === 0) return true
  return myIdentities().some(
    (i) =>
      (item.visibilityIdentities.length === 0 || item.visibilityIdentities.includes(i.type)) &&
      (item.visibilityLevels.length === 0 || (i.level !== undefined && item.visibilityLevels.includes(i.level))),
  )
}

/* [MOCK-ONLY] 首页聚合 handler——缺口 §7-3（GET /api/app/home），接入期实现。 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  return withLatency(() => {
    const payload = readPayload()
    const unread = payload
      ? (noticesByUid[payload.sub] ?? []).filter((n) => !n.read).length
      : 0
    const hotEvents = events
      .filter((event) => event.status === 'published' && parseMockStamp(event.endTime).getTime() > mockNowMs() && visibleTo(event))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 3)
      .map((event) => ({
        id: event.id, title: event.title, type: event.typeLabel, startTime: event.startTime,
        location: event.location, capacity: event.capacity,
      }))
    const latestDemands = demands.filter((demand) => demand.status === 'published' && visibleTo(demand)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map((demand) => ({
      id: demand.id, title: demand.title, categoryLabel: demand.categoryLabel, publisherName: demand.publisherName,
      publisherIdentity: demand.publisherIdentity, deliverBy: demand.deliverBy, deadline: demand.deadline,
      responseCount: demand.responseCount,
    }))
    const topArticles = articles
      .filter((article) => article.status === 'published')
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, 3)
      .map((article) => ({
        id: article.id, title: article.title, columnLabel: article.columnLabel,
        publishedAt: article.publishedAt, views: article.views,
      }))
    return {
      siteName: '聚屿社区',
      siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
      noticesUnread: unread,
      carouselEnabled: appConfig.homeCarouselOpen,
      banners: appConfig.homeCarouselOpen ? homeBanners : [],
      hotEvents,
      latestDemands,
      topArticles,
      /* v40：置顶优先 + 时间倒序取前 2 条 */
      /* 与后端一致：首页顶部公告条仅下发「已开启置顶」的一条，全关则不下发 */
      announcements: announcements.filter((a) => a.pinned).slice(0, 1)
        .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.at.localeCompare(a.at))
        .slice(0, 2),
    }
  }, 200)
}
