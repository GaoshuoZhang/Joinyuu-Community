import type { Announcement, PageResult } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

export interface AnnouncementQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}

/* 已接入 M1 真实接口：GET /api/admin/announcements?page&pageSize&keyword&status — 公告列表（置顶优先，其余按发布时间倒序） */
export async function fetchAnnouncements(query: AnnouncementQuery): Promise<PageResult<Announcement>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<Announcement>>(`/announcements?${qs}`)
}

export interface AnnouncementPayload {
  title: string
  content: string
  pinned: boolean
}

/* 已接入 M1 真实接口：POST /api/admin/announcements — 发布公告（创建即发布） */
export async function createAnnouncement(payload: AnnouncementPayload): Promise<Announcement> {
  return httpPost<Announcement>('/announcements', payload)
}

/* 已接入 M1 真实接口：PUT /api/admin/announcements/:id — 编辑公告（不改状态与发布时间） */
export async function updateAnnouncement(id: string, payload: AnnouncementPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/announcements/${id}`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/announcements/:id/withdraw — 下架公告（客户端公告位立即隐藏） */
export async function withdrawAnnouncement(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/announcements/${id}/withdraw`)
}

/* 已接入 M1 真实接口：POST /api/admin/announcements/:id/publish — 重新发布（更新发布时间） */
export async function publishAnnouncement(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/announcements/${id}/publish`)
}

/* 已接入 M1 真实接口：POST /api/admin/announcements/:id/toggle-pin — 置顶/取消置顶 */
export async function toggleAnnouncementPin(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/announcements/${id}/toggle-pin`)
}

/* 已接入 M1 真实接口：DELETE /api/admin/announcements/:id — 删除公告 */
export async function deleteAnnouncement(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/announcements/${id}`)
}
