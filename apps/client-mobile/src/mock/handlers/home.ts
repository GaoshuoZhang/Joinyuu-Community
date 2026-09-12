import type { HomeFeed } from '@/types'
import { homeArticles, homeBanners, homeDemands, homeEvents, noticesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 首页聚合 handler——缺口 §7-3（GET /api/app/home），接入期实现。 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  return withLatency(() => {
    const payload = readPayload()
    const unread = payload ? (noticesByUid[payload.sub] ?? []).filter((n) => !n.read).length : 0
    return {
      siteName: '聚屿社区',
      siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
      noticesUnread: unread,
      banners: homeBanners,
      hotEvents: homeEvents,
      latestDemands: homeDemands,
      topArticles: homeArticles,
    }
  }, 200)
}
