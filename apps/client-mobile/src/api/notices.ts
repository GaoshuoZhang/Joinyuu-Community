import { httpGet, httpPost, httpPut } from './http'
import type { NoticePreferences, UserNotice } from '@/types'

/** 站内信接口；返回形状与视图层保持一致。 */

/** GET /api/app/notices — 我的站内信列表 */
export async function fetchNotices(page = 1, pageSize = 20): Promise<{ list: UserNotice[]; total: number }> {
  return httpGet<{ list: UserNotice[]; total: number }>(`/notices?page=${page}&pageSize=${pageSize}`)
}

/** GET /api/app/notices/unread-count — 未读数（TabBar/铃铛角标） */
export async function fetchUnreadCount(): Promise<number> {
  return (await httpGet<{ count: number }>('/notices/unread-count')).count
}

/** POST /api/app/notices/:id/read — 标记已读 */
export async function markNoticeRead(id: string): Promise<void> {
  await httpPost(`/notices/${id}/read`)
}

/** POST /api/app/notices/read-all — 全部已读 */
export async function markAllNoticesRead(): Promise<void> {
  await httpPost('/notices/read-all')
}

/** GET /api/app/notices/preferences — 通知偏好（类型目录 + 静音集合） */
export async function fetchNoticePreferences(): Promise<NoticePreferences> {
  return httpGet<NoticePreferences>('/notices/preferences')
}

/** PUT /api/app/notices/preferences — 保存静音集合 */
export async function updateNoticePreferences(mutedTypes: string[]): Promise<NoticePreferences> {
  return httpPut<NoticePreferences>('/notices/preferences', { mutedTypes })
}
