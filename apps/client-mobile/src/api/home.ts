import { apiMode, httpGet } from './http'
import type { HomeFeed } from '@/types'
import * as mock from '@/mock/handlers/home'

/** GET /api/app/home — 首页聚合。 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  if (apiMode === 'mock') return mock.fetchHomeFeed()
  return httpGet<HomeFeed>('/home')
}
