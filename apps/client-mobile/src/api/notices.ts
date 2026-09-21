import { apiMode, httpGet, httpPost, httpPut } from './http'
import type { NoticePreferences, UserNotice } from '@/types'

/** R1 站内信真实接口；mock/http 双模式保持同一视图层形状。 */

/** GET /api/app/notices — 我的站内信列表 */
export async function fetchNotices(page = 1, pageSize = 20): Promise<{ list: UserNotice[]; total: number }> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/notices')).fetchNotices(page, pageSize)
  return httpGet<{ list: UserNotice[]; total: number }>(`/notices?page=${page}&pageSize=${pageSize}`)
}

/** GET /api/app/notices/unread-count — 未读数（TabBar/铃铛角标） */
export async function fetchUnreadCount(): Promise<number> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/notices')).fetchUnreadCount()
  return (await httpGet<{ count: number }>('/notices/unread-count')).count
}

/** POST /api/app/notices/:id/read — 标记已读 */
export async function markNoticeRead(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/notices')).markNoticeRead(id)
  await httpPost(`/notices/${id}/read`)
}

/** POST /api/app/notices/read-all — 全部已读 */
export async function markAllNoticesRead(): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/notices')).markAllNoticesRead()
  await httpPost('/notices/read-all')
}

/** GET /api/app/notices/preferences — 通知偏好（类型目录 + 静音集合） */
export async function fetchNoticePreferences(): Promise<NoticePreferences> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/notices')).fetchNoticePreferences()
  return httpGet<NoticePreferences>('/notices/preferences')
}

/** PUT /api/app/notices/preferences — 保存静音集合 */
export async function updateNoticePreferences(mutedTypes: string[]): Promise<NoticePreferences> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/notices')).updateNoticePreferences(mutedTypes)
  return httpPut<NoticePreferences>('/notices/preferences', { mutedTypes })
}
