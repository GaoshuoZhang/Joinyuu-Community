import type { AuditLog, PageResult } from '@/types'
import { httpGet, httpPut } from './http'

export interface AuditLogQuery {
  page: number
  pageSize: number
  keyword?: string
  module?: string
}

/** 日志保留期（天，0 = 永久保存）——「日志与审计」页右上角「日志设置」 */
export interface LogRetention {
  auditLogRetentionDays: number
  loginLogRetentionDays: number
}

/* GET /api/admin/audit-logs?page&pageSize&keyword&module — 操作日志（最新在前）
 * keyword 跨 target/action/detail/operator 模糊匹配；写操作留痕由后端
 * AuditInterceptor（@Audit 装饰器）与各域服务 AuditService.record 统一完成（含 IP 与 before/after 快照），
 * 前端不再记录审计条目 */
export async function fetchAuditLogs(query: AuditLogQuery): Promise<PageResult<AuditLog>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.module) qs.set('module', query.module)
  return httpGet<PageResult<AuditLog>>(`/audit-logs?${qs}`)
}

/** GET /api/admin/audit-logs/retention — 读取操作日志/登录日志保留期（操作日志页或登录日志页权限任一即可） */
export function fetchLogRetention(): Promise<LogRetention> {
  return httpGet<LogRetention>('/audit-logs/retention')
}

/** PUT /api/admin/audit-logs/retention — 保存保留期；0 = 永久保存（该表不再自动清理） */
export function updateLogRetention(payload: LogRetention): Promise<LogRetention> {
  return httpPut<LogRetention>('/audit-logs/retention', payload)
}

