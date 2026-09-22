import { httpDownload, httpGet, httpPost, httpPut } from './http'
import type { MyStats, PageQuery, PageResult, PointsRecord, RealNameInfo, RealNamePayload, RealnameRightsGroup, UserProfile } from '@/types'

/** GET /api/app/me/stats — 个人数据看板。 */
export async function fetchMyStats(): Promise<MyStats> {
  return httpGet<MyStats>('/me/stats')
}

/** GET /api/app/me — 资料 + 多身份（含经验/等级）+ 积分余额 */
export async function fetchMe(): Promise<UserProfile> {
  return httpGet<UserProfile>('/me')
}

/** PUT /api/app/me — 更新用户名/昵称/头像/性别/简介（邮箱与手机号变更走 /auth/change-*） */
export async function updateMe(payload: Partial<Pick<UserProfile, 'username' | 'nickname' | 'avatar' | 'gender' | 'bio'>>): Promise<void> {
  await httpPut('/me', payload)
}

/** POST /api/app/me/activation-dismissed — 永久隐藏新手任务（按账号持久化，跨浏览器一致） */
export async function dismissActivation(): Promise<void> {
  await httpPost('/me/activation-dismissed')
}

/** GET /api/app/me/realname — 实名认证状态（姓名/证件号脱敏）。 */
export async function fetchRealName(): Promise<RealNameInfo> {
  return httpGet<RealNameInfo>('/me/realname')
}

/** PUT /api/app/me/realname — 提交实名认证（姓名 + 身份证号；服务端按实名核验配置校验） */
export async function submitRealName(payload: RealNamePayload): Promise<void> {
  await httpPut('/me/realname', payload)
}

/** GET /api/app/me/realname-rights — 实名分级权益（按身份/等级分组的每日额度，active 标注当前层级） */
export async function fetchRealnameRights(): Promise<RealnameRightsGroup[]> {
  return httpGet<RealnameRightsGroup[]>('/me/realname-rights')
}

/** GET /api/app/me/points-records — 我的积分流水（分页，含 balance） */
export async function fetchPointsRecords(query: PageQuery = {}): Promise<PageResult<PointsRecord>> {
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 10) })
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<PageResult<PointsRecord>>(`/me/points-records?${qs}`)
}

/* ---------- 账号安全与治理 ---------- */

/** 修改登录密码（校验原密码，并使其他 app 会话失效）。 */
export async function changePassword(payload: { oldPassword: string; password: string }): Promise<void> {
  await httpPost('/me/change-password', { oldPassword: payload.oldPassword, newPassword: payload.password })
}

/** 提交账号注销申请。 */
export async function requestAccountDeletion(reason?: string): Promise<void> {
  await httpPost('/me/deletion-request', { reason })
}

/** 申请生成个人数据导出。 */
export async function requestDataExport(): Promise<void> {
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
  await httpPost('/me/deletion-request/cancel')
}

export async function fetchAccountRequests(): Promise<{ deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string; url?: string } }> {
  return httpGet('/me/account-requests')
}
