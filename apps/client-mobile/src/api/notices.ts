import { apiMode, httpGet, httpPost, httpPut } from './http'
import type { NoticeType, UserNotice } from '@/types'
import * as mock from '@/mock/handlers/notices'

/** [MOCK-ONLY] 站内信四端点为缺口 §7-1（UserNotification 模型 + 触发点），接入期实现 */

/** GET /api/app/me/notices — 我的站内信列表（新置顶） */
export async function fetchNotices(): Promise<UserNotice[]> {
  if (apiMode === 'mock') return mock.fetchNotices()
  return httpGet<UserNotice[]>('/me/notices')
}

/** GET /api/app/me/notices/unread-count — 未读数（TabBar/铃铛角标） */
export async function fetchUnreadCount(): Promise<number> {
  if (apiMode === 'mock') return mock.fetchUnreadCount()
  return httpGet<number>('/me/notices/unread-count')
}

/** POST /api/app/me/notices/:id/read — 标记已读 */
export async function markNoticeRead(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.markNoticeRead(id)
  await httpPost(`/me/notices/${id}/read`)
}

/** POST /api/app/me/notices/read-all — 全部已读 */
export async function markAllNoticesRead(): Promise<void> {
  if (apiMode === 'mock') return mock.markAllNoticesRead()
  await httpPost('/me/notices/read-all')
}

/** [MOCK-ONLY] v39 归档 / 恢复单条通知。 */
export async function archiveNotice(id: string, archived: boolean): Promise<void> {
  if (apiMode === 'mock') return mock.archiveNotice(id, archived)
  await httpPost(`/me/notices/${id}/archive`, { archived })
}

/** [MOCK-ONLY] v38 通知偏好（启用的类型集合）。 */
export async function fetchNoticePrefs(): Promise<NoticeType[]> {
  if (apiMode === 'mock') return mock.fetchNoticePrefs()
  return httpGet<NoticeType[]>('/me/notices/prefs')
}

export async function updateNoticePrefs(types: NoticeType[]): Promise<void> {
  if (apiMode === 'mock') return mock.updateNoticePrefs(types)
  await httpPut('/me/notices/prefs', { types })
}
