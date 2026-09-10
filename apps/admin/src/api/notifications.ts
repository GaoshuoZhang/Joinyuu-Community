import type { AdminNotification } from '@/types'
import { notifications } from '@/mock'
import { delay } from './utils'

/* TODO: 替换为 GET /api/admin/notifications — 通知中心列表（最新在前） */
export async function fetchNotifications(): Promise<AdminNotification[]> {
  await delay(200)
  return [...notifications].sort((a, b) => b.at.localeCompare(a.at))
}

/* TODO: 替换为 POST /api/admin/notifications/:id/read — 标记单条已读 */
export async function markNotificationRead(id: string): Promise<{ code: number }> {
  await delay(150)
  const item = notifications.find((n) => n.id === id)
  if (item) item.read = true
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/notifications/read-all — 全部已读 */
export async function markAllNotificationsRead(): Promise<{ code: number }> {
  await delay(200)
  for (const n of notifications) n.read = true
  return { code: 0 }
}
