import { apiMode, httpGet, httpPost } from './http'
import type { UserNotice } from '@/types'
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
