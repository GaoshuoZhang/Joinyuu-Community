import { apiMode, httpGet, httpPost } from './http'
import type { FavoriteItem, FavoriteTargetType } from '@/types'
import * as mock from '@/mock/handlers/favorites'

/** [MOCK-ONLY] 我的收藏（需求 / 文章 / 活动）。 */
export async function listFavorites(): Promise<FavoriteItem[]> {
  if (apiMode === 'mock') return mock.listFavorites()
  return httpGet<FavoriteItem[]>('/me/favorites')
}

/** [MOCK-ONLY] 收藏 / 取消收藏，返回切换后的状态。 */
export async function toggleFavorite(type: FavoriteTargetType, targetId: string, title: string, subtitle?: string): Promise<boolean> {
  if (apiMode === 'mock') return mock.toggleFavorite(type, targetId, title, subtitle)
  const res = await httpPost<{ favorited: boolean }>('/me/favorites/toggle', { type, targetId, title, subtitle })
  return res.favorited
}
