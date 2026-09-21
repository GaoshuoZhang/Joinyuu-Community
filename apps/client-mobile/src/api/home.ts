import { apiMode, httpGet } from './http'
import type { HomeFeed } from '@/types'

/** GET /api/app/home — 首页聚合。 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/home')).fetchHomeFeed()
  return httpGet<HomeFeed>('/home')
}
