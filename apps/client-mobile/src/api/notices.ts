import { apiMode, httpGet, httpPost, httpPut } from './http'
import type { NoticeType, UserNotice } from '@/types'
import * as mock from '@/mock/handlers/notices'

/** R1 站内信真实接口；mock/http 双模式保持同一视图层形状。 */

/** GET /api/app/notices — 我的站内信列表 */
export async function fetchNotices(): Promise<UserNotice[]> {
  if (apiMode === 'mock') return mock.fetchNotices()
  const result = await httpGet<{ list: UserNotice[] }>('/notices?page=1&pageSize=50')
  return result.list
}

/** GET /api/app/notices/unread-count — 未读数（TabBar/铃铛角标） */
export async function fetchUnreadCount(): Promise<number> {
  if (apiMode === 'mock') return mock.fetchUnreadCount()
  return (await httpGet<{ count: number }>('/notices/unread-count')).count
}

/** POST /api/app/notices/:id/read — 标记已读 */
export async function markNoticeRead(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.markNoticeRead(id)
  await httpPost(`/notices/${id}/read`)
}

/** POST /api/app/notices/read-all — 全部已读 */
export async function markAllNoticesRead(): Promise<void> {
  if (apiMode === 'mock') return mock.markAllNoticesRead()
  await httpPost('/notices/read-all')
}

/** 归档 / 恢复单条通知。 */
export async function archiveNotice(id: string, archived: boolean): Promise<void> {
  if (apiMode === 'mock') return mock.archiveNotice(id, archived)
  await httpPost(`/notices/${id}/archive`, { archived })
}

/** 通知偏好（启用的类型集合）。 */
export async function fetchNoticePrefs(): Promise<NoticeType[]> {
  if (apiMode === 'mock') return mock.fetchNoticePrefs()
  return (await httpGet<{ enabledTypes: NoticeType[] }>('/me/notices/prefs')).enabledTypes
}

export async function updateNoticePrefs(types: NoticeType[]): Promise<void> {
  if (apiMode === 'mock') return mock.updateNoticePrefs(types)
  await httpPut('/me/notices/prefs', { enabledTypes: types })
}
