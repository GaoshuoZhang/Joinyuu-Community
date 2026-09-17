import type { HomeFeed } from '@/types'
import { announcements, appConfig, articles, demands, events, homeBanners, noticesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 首页聚合 handler——缺口 §7-3（GET /api/app/home），接入期实现。 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  return withLatency(() => {
    const payload = readPayload()
    const unread = payload
      ? (noticesByUid[payload.sub] ?? []).filter((n) => !n.read).length
      : 0
    const hotEvents = events.filter((event) => event.status === 'published').slice(0, 3).map((event) => ({
      id: event.id, title: event.title, type: event.typeLabel, startTime: event.startTime,
      location: event.location, enrolled: event.approvedCount, capacity: event.capacity,
    }))
    const latestDemands = demands.filter((demand) => demand.status === 'published').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map((demand) => ({
      id: demand.id, title: demand.title, categoryLabel: demand.categoryLabel, publisherName: demand.publisherName,
      publisherIdentity: demand.publisherIdentity, deliverBy: demand.deliverBy, deadline: demand.deadline,
      responseCount: demand.responseCount,
    }))
    const topArticles = [...articles].sort((a, b) => b.views - a.views).slice(0, 3).map((article) => ({
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
      announcements: [...announcements]
        .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.at.localeCompare(a.at))
        .slice(0, 2),
    }
  }, 200)
}
