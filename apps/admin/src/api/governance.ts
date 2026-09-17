import { httpGet, httpPost } from './http'

export type GovernanceReportStatus = 'pending' | 'resolved' | 'rejected'
export type GovernanceAppealStatus = 'pending' | 'resolved' | 'rejected'

export interface GovernanceReport {
  id: string
  reporterId: string
  targetType: 'demand' | 'article' | 'enterprise' | 'comment' | 'user'
  targetId: string
  targetTitle: string
  reason: string
  detail?: string | null
  status: GovernanceReportStatus
  canRestore: boolean
  at: string
  handledAt?: string | null
  handledBy?: string | null
  resolution?: string | null
}

export interface GovernanceAppeal {
  id: number
  appellantId: string
  targetType: 'demand' | 'article'
  targetId: string
  reason: string
  status: GovernanceAppealStatus
  createdAt: string
  handledAt?: string | null
  handledBy?: string | null
  resolution?: string | null
}

function pageQuery(page: number, pageSize: number, filters: Record<string, string | undefined>) {
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  for (const [key, value] of Object.entries(filters)) if (value) qs.set(key, value)
  return qs.toString()
}

export function fetchGovernanceReports(page: number, pageSize: number, status?: string, targetType?: string) {
  return httpGet<{ list: GovernanceReport[]; total: number }>(`/governance/reports?${pageQuery(page, pageSize, { status, targetType })}`)
}

export function reviewGovernanceReport(id: string, payload: { status: 'resolved' | 'rejected'; resolution: string; action: 'none' | 'hide' | 'restore'; takedownReason?: string }) {
  return httpPost<{ code: number }>(`/governance/reports/${id}/review`, payload)
}

export function fetchGovernanceAppeals(page: number, pageSize: number, status?: string) {
  return httpGet<{ list: GovernanceAppeal[]; total: number }>(`/governance/appeals?${pageQuery(page, pageSize, { status })}`)
}

export function reviewGovernanceAppeal(id: number, payload: { decision: 'accepted' | 'rejected'; resolution: string }) {
  return httpPost<{ code: number }>(`/governance/appeals/${id}/review`, payload)
}
