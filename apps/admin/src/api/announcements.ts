import type { Announcement, PageResult } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

export interface AnnouncementQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}

/* GET /api/admin/announcements?page&pageSize&keyword&status — 公告列表（置顶优先，其余按发布时间倒序） */
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
  expireAt?: string
  link?: string
}

/* POST /api/admin/announcements — 发布公告（新增即发布） */
export async function createAnnouncement(payload: AnnouncementPayload): Promise<Announcement> {
  return httpPost<Announcement>('/announcements', payload)
}

/* PUT /api/admin/announcements/:id — 编辑公告（不改状态与发布时间） */
export async function updateAnnouncement(id: string, payload: AnnouncementPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/announcements/${id}`, payload)
}

/* POST /api/admin/announcements/:id/withdraw — 下架公告（客户端首页公告条立即隐藏） */
export async function withdrawAnnouncement(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/announcements/${id}/withdraw`)
}

/* POST /api/admin/announcements/:id/publish — 重新发布（更新发布时间） */
export async function publishAnnouncement(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/announcements/${id}/publish`)
}

/* POST /api/admin/announcements/:id/toggle-pin — 置顶/取消置顶 */
export async function toggleAnnouncementPin(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/announcements/${id}/toggle-pin`)
}

/* DELETE /api/admin/announcements/:id — 删除公告 */
export async function deleteAnnouncement(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/announcements/${id}`)
}

/* ---------- 首页公告单例（移动端首页搜索栏下方仅展示一条） ---------- */

export interface HomeAnnouncement {
  id: string | null
  title: string
  content: string
  enabled: boolean
  link: string
  publishedAt: string
  updatedAt: string
}

export interface HomeAnnouncementPayload {
  title: string
  content: string
  enabled: boolean
  link?: string
}

/* GET /api/admin/announcements/home — 读取当前首页公告（未创建时返回空表单） */
export async function fetchHomeAnnouncement(): Promise<HomeAnnouncement> {
  return httpGet<HomeAnnouncement>('/announcements/home')
}

/* PUT /api/admin/announcements/home — 保存首页公告内容与开启状态（开启时全局仅一条） */
export async function saveHomeAnnouncement(payload: HomeAnnouncementPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/announcements/home', payload)
}
