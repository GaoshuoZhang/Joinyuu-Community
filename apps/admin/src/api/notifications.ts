import type { AdminNotification } from '@/types'
import { httpGet, httpPost } from './http'

/* 已接入 M1 真实接口：GET /api/admin/notifications — 通知中心列表（最新在前）
 * 业务通知由后端各域服务与定时任务写入（审批提交/租约临期/定时发布等） */
export async function fetchNotifications(): Promise<AdminNotification[]> {
  return httpGet<AdminNotification[]>('/notifications')
}

/* 已接入 M1 真实接口：POST /api/admin/notifications/:id/read — 标记单条已读（幂等） */
export async function markNotificationRead(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/notifications/${id}/read`)
}

/* 已接入 M1 真实接口：POST /api/admin/notifications/read-all — 全部已读 */
export async function markAllNotificationsRead(): Promise<{ code: number }> {
  return httpPost<{ code: number }>('/notifications/read-all')
}
