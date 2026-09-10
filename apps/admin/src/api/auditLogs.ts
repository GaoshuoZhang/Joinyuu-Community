import type { AuditLog, AuditModule, PageResult } from '@/types'
import { auditLogs } from '@/mock'
import { delay } from './utils'

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* 审计埋点：各域写操作成功后调用（operator 固定为当前管理员，M1 取登录态） */
export function recordAudit(module: AuditModule, action: string, target: string, detail?: string) {
  const maxNum = auditLogs.reduce((m, l) => Math.max(m, Number(l.id.replace('AL', ''))), 1000)
  auditLogs.unshift({
    id: `AL${maxNum + 1}`,
    operator: '社区管理员',
    module,
    action,
    target,
    detail,
    at: formatNow(),
  })
}

export interface AuditLogQuery {
  page: number
  pageSize: number
  keyword?: string
  module?: string
}

/* TODO: 替换为 GET /api/admin/audit-logs?page&pageSize&keyword&module — 审计日志（最新在前） */
export async function fetchAuditLogs(query: AuditLogQuery): Promise<PageResult<AuditLog>> {
  await delay(400)
  let list = [...auditLogs]
  if (query.module) list = list.filter((l) => l.module === query.module)
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter(
      (l) =>
        l.target.toLowerCase().includes(kw) ||
        l.action.toLowerCase().includes(kw) ||
        (l.detail ?? '').toLowerCase().includes(kw) ||
        l.operator.toLowerCase().includes(kw),
    )
  }
  /* 埋点 unshift 已保证新日志在前，再按时间倒序兜底 */
  list.sort((a, b) => b.at.localeCompare(a.at) || Number(b.id.replace('AL', '')) - Number(a.id.replace('AL', '')))
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}
