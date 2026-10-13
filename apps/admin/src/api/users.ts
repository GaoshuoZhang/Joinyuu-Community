import type {
  ApplicationStatus,
  ArticleStatus,
  DemandStatus,
  EventStatus,
  LeaseBaseStatus,
  PageResult,
  ProjectStatus,
  ReservationStatus,
  User,
} from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

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

/* GET /api/admin/users?page&pageSize&keyword&status&category&realStatus
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

export interface CreateUserPayload {
  /** 用户名（选填：留空由服务端自动分配） */
  username?: string
  nickname: string
  phone: string
  email?: string
  gender: User['gender']
  realName?: string
  citizenId?: string
  bio?: string
}

export function createUser(payload: CreateUserPayload): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/users', payload)
}

/* POST /api/admin/users/:id/reset-password — 管理员强制覆盖用户登录密码 */
export async function resetUserPassword(id: string, password: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/users/${id}/reset-password`, { password })
}

/* GET /api/admin/users/:id
 * stats 从需求/项目/活动数据实时汇总，保证与列表页按用户筛选的结果一致 */
export async function fetchUser(id: string): Promise<User> {
  return httpGet<User>(`/users/${id}`)
}

/* ---------- 用户记录聚合（GET /api/admin/users/:id/records） ---------- */

export interface UserApplicationRecord {
  id: string
  /** 申请类型：settle / individual / cooperation / identity */
  type: string
  targetName: string
  status: ApplicationStatus
  submittedAt: string
  summary: string
  /** 非空表示已归档 */
  deletedAt: string | null
}

export interface UserDemandRecord {
  id: string
  title: string
  status: DemandStatus
  createdAt: string
  /** 非空表示已归档 */
  deletedAt: string | null
}

export interface UserProjectRecord {
  id: string
  name: string
  code: string
  status: ProjectStatus
  initiatedAt: string
  /** 非空表示已归档 */
  deletedAt: string | null
}

export interface UserEventRecord {
  id: string
  title: string
  status: EventStatus
  startTime: string
  endTime: string
  /** 非空表示已归档 */
  deletedAt: string | null
}

export interface UserLeaseRecord {
  id: string
  renterName: string
  status: LeaseBaseStatus
  startDate: string
  endDate: string
  longTerm: boolean
  terminatedAt: string | null
  /** 非空表示已归档 */
  deletedAt: string | null
}

export interface UserSubmissionRecord {
  id: string
  title: string
  status: ArticleStatus
  createdAt: string
  publishedAt: string | null
  /** 非空表示已归档 */
  deletedAt: string | null
}

export interface UserReservationRecord {
  id: string
  spaceName: string
  date: string
  startTime: string
  endTime: string
  status: ReservationStatus
  /** 非空表示已归档 */
  deletedAt: string | null
}

/** 七类记录数组（含已归档条目，deletedAt 非空即已归档） */
export interface UserRecords {
  applications: UserApplicationRecord[]
  demands: UserDemandRecord[]
  projects: UserProjectRecord[]
  events: UserEventRecord[]
  leases: UserLeaseRecord[]
  submissions: UserSubmissionRecord[]
  reservations: UserReservationRecord[]
}

/* GET /api/admin/users/:id/records — 用户记录聚合，进入详情页时加载一次 */
export async function fetchUserRecords(id: string): Promise<UserRecords> {
  return httpGet<UserRecords>(`/users/${id}/records`)
}

/* PUT /api/admin/users/:id — 编辑用户资料 */
export interface UserProfilePayload {
  /** 用户名（全站唯一，字母开头 4-20 位，仅字母/数字/下划线） */
  username?: string
  nickname?: string
  phone?: string
  email?: string
  gender?: string
  realName?: string
  citizenId?: string
  bio?: string
  /** 头像地址（素材上传回填，如 /api/public/files/xxx.png）：空串 = 清除头像 */
  avatar?: string
}

export async function updateUser(id: string, payload: UserProfilePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/users/${id}`, payload)
}

/* PATCH /api/admin/users/:id/status，入参 { status } */
export async function updateUserStatus(id: string, status: User['status']): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/users/${id}/status`, { status })
}

/* POST /api/admin/users/:id/freeze，入参 { until?, permanent, reason }
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

/* GET /api/admin/users/options — 用户下拉候选（后台代提交需求等场景） */
export async function fetchUserOptions(): Promise<{ label: string; value: string }[]> {
  return httpGet<{ label: string; value: string }[]>('/users/options')
}
