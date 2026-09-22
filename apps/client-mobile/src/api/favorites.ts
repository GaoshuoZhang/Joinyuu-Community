import { httpGet, httpPost } from './http'
import type { FavoriteItem, FavoriteTargetType } from '@/types'

/** 我的收藏（需求 / 文章 / 活动 / 企业 / 人才）。 */
export async function listFavorites(): Promise<FavoriteItem[]> {
  return httpGet<FavoriteItem[]>('/me/favorites')
}

/** 收藏 / 取消收藏，返回切换后的状态。 */
export async function toggleFavorite(type: FavoriteTargetType, targetId: string, title: string, subtitle?: string): Promise<boolean> {
  const res = await httpPost<{ favorited: boolean }>('/me/favorites/toggle', { type, targetId, title, subtitle })
  return res.favorited
}
