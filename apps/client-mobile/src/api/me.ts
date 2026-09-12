import { apiMode, httpGet, httpPut } from './http'
import type { PageQuery, PageResult, PointsRecord, UserProfile } from '@/types'
import * as mock from '@/mock/handlers/me'

/** GET /api/app/me — 资料 + 多身份（含经验/等级）+ 积分余额 */
export async function fetchMe(): Promise<UserProfile> {
  if (apiMode === 'mock') return mock.fetchMe()
  return httpGet<UserProfile>('/me')
}

/** PUT /api/app/me — 更新昵称/性别/简介等可编辑字段 */
export async function updateMe(payload: Partial<Pick<UserProfile, 'nickname' | 'gender' | 'bio'>>): Promise<void> {
  if (apiMode === 'mock') return mock.updateMe(payload)
  await httpPut('/me', payload)
}

/** GET /api/app/me/points-records — 我的积分流水（分页，含 balance） */
export async function fetchPointsRecords(query: PageQuery = {}): Promise<PageResult<PointsRecord>> {
  if (apiMode === 'mock') return mock.fetchPointsRecords(query)
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<PageResult<PointsRecord>>(`/me/points-records?${qs}`)
}
