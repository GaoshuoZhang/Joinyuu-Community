import { apiMode, httpGet } from './http'
import type { HomeFeed } from '@/types'
import * as mock from '@/mock/handlers/home'

/** [MOCK-ONLY] 首页聚合为缺口 §7-3（GET /api/app/home），接入期实现 */
export async function fetchHomeFeed(): Promise<HomeFeed> {
  if (apiMode === 'mock') return mock.fetchHomeFeed()
  return httpGet<HomeFeed>('/home')
}
