import { httpGet, httpPost, httpPut } from './http'

/* 归档管理 API（/api/admin/trash）：各业务域归档对象集中管理 + 按标签页独立归档设置 */

export interface ArchiveItem {
  id: string
  domain: string
  domainLabel: string
  title: string
  deletedAt: string
  deletedBy: string
  data: Record<string, any>
}

export interface ArchiveQuery {
  domain?: string
  page: number
  pageSize: number
  keyword?: string
}

export interface ArchivePage {
  list: ArchiveItem[]
  total: number
}

export interface ArchivableStatus {
  value: string
  label: string
  enabled: boolean
}

export interface ArchiveSetting {
  domain: string
  label: string
  autoArchive: boolean
  autoArchiveSupported: boolean
  archiveDelayDays: number
  autoPurge: boolean
  purgeDelayDays: number
  archivableStatuses: ArchivableStatus[]
}

export interface ArchiveSettingPayload {
  autoArchive?: boolean
  archiveDelayDays?: number
  autoPurge?: boolean
  purgeDelayDays?: number
  archiveStatuses?: Record<string, boolean>
}

/** GET /api/admin/trash?domain&page&pageSize&keyword */
export async function fetchArchiveList(query: ArchiveQuery): Promise<ArchivePage> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.domain) qs.set('domain', query.domain)
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<ArchivePage>(`/trash?${qs}`)
}

/** POST /api/admin/trash/:domain/:id/restore */
export async function restoreArchived(domain: string, id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/trash/${domain}/${id}/restore`)
}

/** POST /api/admin/trash/:domain/:id/purge（彻底删除） */
export async function purgeArchived(domain: string, id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/trash/${domain}/${id}/purge`)
}

/** GET /api/admin/trash/settings */
export async function fetchArchiveSettings(): Promise<ArchiveSetting[]> {
  return httpGet<ArchiveSetting[]>('/trash/settings')
}

/** PUT /api/admin/trash/settings/:domain */
export async function updateArchiveSettings(
  domain: string,
  payload: ArchiveSettingPayload,
): Promise<ArchiveSetting> {
  return httpPut<ArchiveSetting>(`/trash/settings/${domain}`, payload)
}
