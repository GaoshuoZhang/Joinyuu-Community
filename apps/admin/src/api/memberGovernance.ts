import { httpGet, httpPost } from './http'

export interface DeletionRow {
  id: string; userId: string; status: string; requestedAt: string; effectiveAt: string | null
  reason: string | null; reviewedAt: string | null; reviewedBy: string | null; reviewNote: string | null
  user: { uid: string; nickname: string; realName: string; phone: string; status: string }
}
export const fetchDeletions = (page: number, status: string) => httpGet<{ list: DeletionRow[]; total: number }>(`/member-governance/deletions?page=${page}&pageSize=20&status=${encodeURIComponent(status)}`)
export const reviewDeletion = (id: string, action: 'approve' | 'reject', note: string) => httpPost(`/member-governance/deletions/${id}/review`, { action, note })
