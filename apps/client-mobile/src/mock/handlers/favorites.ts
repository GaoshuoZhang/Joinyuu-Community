import type { FavoriteItem, FavoriteTargetType } from '@/types'
import { favoritesByUid, nextMockId, nowStamp, trackMockEvent } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] v37 收藏：需求 / 文章 / 活动（登录后可用；接入期接 /api/app/me/favorites）。 */

export async function listFavorites(): Promise<FavoriteItem[]> {
  return withLatency(() => {
    const uid = readPayload()?.sub
    if (!uid) return []
    return [...(favoritesByUid[uid] ?? [])]
  }, 120)
}

/** 收藏 / 取消收藏，返回切换后的收藏状态。 */
export async function toggleFavorite(type: FavoriteTargetType, targetId: string, title: string, subtitle?: string): Promise<boolean> {
  return withLatency(() => {
    const uid = readPayload()?.sub
    if (!uid) fail(401, '请先登录后再收藏')
    const list = (favoritesByUid[uid] ??= [])
    const index = list.findIndex((item) => item.type === type && item.targetId === targetId)
    if (index >= 0) {
      list.splice(index, 1)
      return false
    }
    list.unshift({ id: nextMockId('FV'), type, targetId, title, subtitle: subtitle || undefined, at: nowStamp() })
    trackMockEvent('favorite_add')
    return true
  })
}
