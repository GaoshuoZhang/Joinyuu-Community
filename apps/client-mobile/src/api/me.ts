import { apiMode, httpGet, httpPut } from './http'
import type { PageQuery, PageResult, PointsRecord, RealNameInfo, RealNamePayload, UserProfile } from '@/types'
import * as mock from '@/mock/handlers/me'

/** GET /api/app/me — 资料 + 多身份（含经验/等级）+ 积分余额 */
export async function fetchMe(): Promise<UserProfile> {
  if (apiMode === 'mock') return mock.fetchMe()
  return httpGet<UserProfile>('/me')
}

/** PUT /api/app/me — 更新昵称/头像/性别/简介等可编辑字段 */
export async function updateMe(payload: Partial<Pick<UserProfile, 'nickname' | 'avatar' | 'gender' | 'bio'>>): Promise<void> {
  if (apiMode === 'mock') return mock.updateMe(payload)
  await httpPut('/me', payload)
}

/** GET /api/app/me/realname — 实名认证状态（姓名/证件号脱敏；缺口 §7.1-18） */
export async function fetchRealName(): Promise<RealNameInfo> {
  if (apiMode === 'mock') return mock.fetchRealName()
  return httpGet<RealNameInfo>('/me/realname')
}

/** PUT /api/app/me/realname — 提交实名认证（姓名 + 身份证号；mock 即时通过，真实后端三要素核验） */
export async function submitRealName(payload: RealNamePayload): Promise<void> {
  if (apiMode === 'mock') return mock.submitRealName(payload)
  await httpPut('/me/realname', payload)
}

/** GET /api/app/me/points-records — 我的积分流水（分页，含 balance） */
export async function fetchPointsRecords(query: PageQuery = {}): Promise<PageResult<PointsRecord>> {
  if (apiMode === 'mock') return mock.fetchPointsRecords(query)
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<PageResult<PointsRecord>>(`/me/points-records?${qs}`)
}
