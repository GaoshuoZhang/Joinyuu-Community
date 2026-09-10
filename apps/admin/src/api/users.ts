import type { PageResult, User } from '@/types'
import { httpGet, httpPatch, httpPost } from './http'

export interface UserQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  /** 身份筛选：individual=个人用户（仅持有基础个人身份）| community_individual | community_enterprise | external_enterprise */
  category?: string
  /** 实名状态筛选：verified=已实名（真实姓名+身份证号齐全）| unverified=未实名 */
  realStatus?: string
}

/* 已接入 M1 真实接口：GET /api/admin/users?page&pageSize&keyword&status&category&realStatus
 * 返回 { code: 0, data: { list, total } }
 */
export async function fetchUsers(query: UserQuery): Promise<PageResult<User>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.status) qs.set('status', query.status)
  if (query.category) qs.set('category', query.category)
  if (query.realStatus) qs.set('realStatus', query.realStatus)
  return httpGet<PageResult<User>>(`/users?${qs}`)
}

/* 已接入 M1 真实接口：GET /api/admin/users/:id
 * stats 从需求/项目/活动数据实时汇总，保证与列表页按用户筛选的结果一致 */
export async function fetchUser(id: string): Promise<User> {
  return httpGet<User>(`/users/${id}`)
}

/* 已接入 M1 真实接口：PATCH /api/admin/users/:id/status，入参 { status } */
export async function updateUserStatus(id: string, status: User['status']): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/users/${id}/status`, { status })
}

/* 已接入 M1 真实接口：POST /api/admin/users/:id/freeze，入参 { until?, permanent, reason }
 * 冻结账号：permanent=true 长期冻结（不写 frozenUntil），否则需冻结期限（日期+时间）；reason 必填 */
export interface UserFreezePayload {
  /** 冻结期限（日期+时间；permanent=true 时忽略） */
  until?: string
  /** 长期冻结 */
  permanent: boolean
  /** 冻结原因（必填） */
  reason: string
}

export async function freezeUser(id: string, payload: UserFreezePayload): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/users/${id}/freeze`, payload)
}

/* 已接入 M1 真实接口：GET /api/admin/users/options — 用户下拉候选（后台代提交需求等场景） */
export async function fetchUserOptions(): Promise<{ label: string; value: string }[]> {
  return httpGet<{ label: string; value: string }[]>('/users/options')
}
