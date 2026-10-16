import { httpGet } from './http'

/* 登录日志 API（/api/admin/login-logs）
 * 形状：登录时间/IP/设备/状态/失败原因 */

export type LoginResult = 'success' | 'failed' | 'locked'

export interface LoginLog {
  id: string
  username: string
  /** 管理员昵称/姓名（展示用） */
  name: string
  ip: string
  region: string
  /** 如 Chrome 134 / macOS 14 */
  device: string
  status: LoginResult
  /** 失败原因（failed/locked 时存在） */
  failedReason?: string
  createdAt: string
}

export interface LoginLogQuery {
  page: number
  pageSize: number
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  keyword?: string
  startDate?: string
  endDate?: string
}

export interface LoginLogPage {
  list: LoginLog[]
  total: number
}

/** GET /api/admin/login-logs?page&pageSize&status&keyword&startDate&endDate */
export async function fetchLoginLogs(query: LoginLogQuery): Promise<LoginLogPage> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.startDate) qs.set('startDate', query.startDate)
  if (query.endDate) qs.set('endDate', query.endDate)
  return httpGet<LoginLogPage>(`/login-logs?${qs}`)
}
