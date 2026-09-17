import { apiMode, httpDownload, httpGet, httpPost, httpPut } from './http'
import type { MyStats, PageQuery, PageResult, PointsRecord, RealNameInfo, RealNamePayload, RealnameRightsGroup, ReportPayload, UserProfile } from '@/types'
import * as mock from '@/mock/handlers/me'

/** GET /api/app/me/stats — 个人数据看板（v42 [MOCK-ONLY]） */
export async function fetchMyStats(): Promise<MyStats> {
  if (apiMode === 'mock') return mock.fetchMyStats()
  return httpGet<MyStats>('/me/stats')
}

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

/** GET /api/app/me/realname-rights — 实名分级权益（按身份/等级分组的每日额度，active 标注当前层级） */
export async function fetchRealnameRights(): Promise<RealnameRightsGroup[]> {
  if (apiMode === 'mock') return mock.fetchRealnameRights()
  return httpGet<RealnameRightsGroup[]>('/me/realname-rights')
}

/** GET /api/app/me/points-records — 我的积分流水（分页，含 balance） */
export async function fetchPointsRecords(query: PageQuery = {}): Promise<PageResult<PointsRecord>> {
  if (apiMode === 'mock') return mock.fetchPointsRecords(query)
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<PageResult<PointsRecord>>(`/me/points-records?${qs}`)
}

/* ---------- 账号安全与治理（R1 已接入；举报与屏蔽留待 R3） ---------- */

/** 修改登录密码（校验原密码，并使其他 app 会话失效）。 */
export async function changePassword(payload: { oldPassword: string; password: string }): Promise<void> {
  if (apiMode === 'mock') return mock.changePassword(payload)
  await httpPost('/me/change-password', { oldPassword: payload.oldPassword, newPassword: payload.password })
}

/** 提交账号注销申请。 */
export async function requestAccountDeletion(reason?: string): Promise<void> {
  if (apiMode === 'mock') return mock.requestAccountDeletion(reason)
  await httpPost('/me/deletion-request', { reason })
}

/** 申请生成个人数据导出。 */
export async function requestDataExport(): Promise<void> {
  if (apiMode === 'mock') return mock.requestDataExport()
  await httpPost('/me/data-export')
}

export async function downloadPersonalData(url: string): Promise<void> {
  const blob = await httpDownload(url)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = '聚屿社区-个人数据.json'
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

/** 我的账号申请状态（注销 / 导出）。 */
/** POST /api/app/me/deletion-request/cancel — 冷静期内撤回注销申请 */
export async function cancelAccountDeletion(): Promise<void> {
  if (apiMode === 'mock') return mock.cancelAccountDeletion()
  await httpPost('/me/deletion-request/cancel')
}

export async function fetchAccountRequests(): Promise<{ deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string; url?: string } }> {
  if (apiMode === 'mock') return mock.fetchAccountRequests()
  return httpGet('/me/account-requests')
}

/** [MOCK-ONLY] 我的举报记录（含处理状态）。 */
export async function listMyReports(): Promise<(ReportPayload & { id: string; at: string; status: 'pending' | 'resolved' | 'rejected' })[]> {
  if (apiMode === 'mock') return mock.listMyReports()
  return httpGet('/me/reports')
}

/** [MOCK-ONLY] 屏蔽名单。 */
export async function listBlockedUsers(): Promise<{ uid: string; name: string }[]> {
  if (apiMode === 'mock') return mock.listBlockedUsers()
  return httpGet('/me/blocklist')
}

export async function blockUser(targetUid: string): Promise<void> {
  if (apiMode === 'mock') return mock.blockUser(targetUid)
  await httpPost('/me/blocklist', { uid: targetUid })
}

export async function unblockUser(targetUid: string): Promise<void> {
  if (apiMode === 'mock') return mock.unblockUser(targetUid)
  await httpPost(`/me/blocklist/${targetUid}/remove`)
}
