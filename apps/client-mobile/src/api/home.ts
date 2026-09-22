import { httpGet } from './http'
import type { HomeFeed } from '@/types'

/** GET /api/app/home — 首页聚合。 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  return httpGet<HomeFeed>('/home')
}
