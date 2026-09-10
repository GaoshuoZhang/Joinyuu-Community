import type { Announcement, PageResult } from '@/types'
import { announcements } from '@/mock'
import { delay } from './utils'
import { recordAudit } from './auditLogs'

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export interface AnnouncementQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
}

/* TODO: 替换为 GET /api/admin/announcements?page&pageSize&keyword&status — 公告列表（置顶优先，其余按发布时间倒序） */
export async function fetchAnnouncements(query: AnnouncementQuery): Promise<PageResult<Announcement>> {
  await delay(400)
  let list = [...announcements]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((a) => a.title.toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw))
  }
  if (query.status) list = list.filter((a) => a.status === query.status)
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.publishedAt.localeCompare(a.publishedAt) || b.id.localeCompare(a.id)
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

export interface AnnouncementPayload {
  title: string
  content: string
  pinned: boolean
}

/* TODO: 替换为 POST /api/admin/announcements — 发布公告（创建即发布） */
export async function createAnnouncement(payload: AnnouncementPayload): Promise<Announcement> {
  await delay(500)
  const now = formatNow()
  const maxNum = announcements.reduce((m, a) => Math.max(m, Number(a.id.replace('AN', ''))), 1000)
  const item: Announcement = {
    id: `AN${maxNum + 1}`,
    title: payload.title.trim(),
    content: payload.content.trim(),
    pinned: payload.pinned,
    status: 'published',
    publishedAt: now,
    createdAt: now,
  }
  announcements.push(item)
  recordAudit('内容管理', '发布公告', `${item.id} · ${item.title}`, item.pinned ? '置顶' : undefined)
  return item
}

/* TODO: 替换为 PUT /api/admin/announcements/:id — 编辑公告（不改状态与发布时间） */
export async function updateAnnouncement(id: string, payload: AnnouncementPayload): Promise<{ code: number }> {
  await delay(400)
  const item = announcements.find((a) => a.id === id)
  if (!item) throw new Error('公告不存在')
  item.title = payload.title.trim()
  item.content = payload.content.trim()
  item.pinned = payload.pinned
  item.updatedAt = formatNow()
  recordAudit('内容管理', '编辑公告', `${item.id} · ${item.title}`)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/announcements/:id/withdraw — 下架公告（客户端公告位立即隐藏） */
export async function withdrawAnnouncement(id: string): Promise<{ code: number }> {
  await delay(350)
  const item = announcements.find((a) => a.id === id)
  if (!item) throw new Error('公告不存在')
  if (item.status !== 'published') throw new Error('仅已发布公告可下架')
  item.status = 'withdrawn'
  item.updatedAt = formatNow()
  recordAudit('内容管理', '下架公告', `${item.id} · ${item.title}`)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/announcements/:id/publish — 重新发布（更新发布时间） */
export async function publishAnnouncement(id: string): Promise<{ code: number }> {
  await delay(350)
  const item = announcements.find((a) => a.id === id)
  if (!item) throw new Error('公告不存在')
  if (item.status !== 'withdrawn') throw new Error('仅已下架公告可重新发布')
  item.status = 'published'
  item.publishedAt = formatNow()
  recordAudit('内容管理', '重新发布公告', `${item.id} · ${item.title}`)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/announcements/:id/toggle-pin — 置顶/取消置顶 */
export async function toggleAnnouncementPin(id: string): Promise<{ code: number }> {
  await delay(300)
  const item = announcements.find((a) => a.id === id)
  if (!item) throw new Error('公告不存在')
  item.pinned = !item.pinned
  item.updatedAt = formatNow()
  recordAudit('内容管理', item.pinned ? '公告置顶' : '取消公告置顶', `${item.id} · ${item.title}`)
  return { code: 0 }
}

/* TODO: 替换为 DELETE /api/admin/announcements/:id — 删除公告 */
export async function deleteAnnouncement(id: string): Promise<{ code: number }> {
  await delay(350)
  const idx = announcements.findIndex((a) => a.id === id)
  if (idx < 0) throw new Error('公告不存在')
  const [removed] = announcements.splice(idx, 1)
  recordAudit('内容管理', '删除公告', `${removed.id} · ${removed.title}`)
  return { code: 0 }
}
