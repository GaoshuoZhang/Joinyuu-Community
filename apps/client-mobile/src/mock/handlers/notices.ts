import type { UserNotice } from '@/types'
import { noticesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 站内信 handlers——缺口 §7-1（UserNotification 模型 + 端点 + 触发点），接入期实现并销号。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchNotices(): Promise<UserNotice[]> {
  return withLatency(() => [...(noticesByUid[requireUid()] ?? [])].sort((a, b) => b.at.localeCompare(a.at)))
}

export async function fetchUnreadCount(): Promise<number> {
  return withLatency(() => (noticesByUid[requireUid()] ?? []).filter((n) => !n.read).length, 100)
}

export async function markNoticeRead(id: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const notice = (noticesByUid[uid] ?? []).find((n) => n.id === id)
    if (notice) notice.read = true
  }, 120)
}

export async function markAllNoticesRead(): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    for (const n of noticesByUid[uid] ?? []) n.read = true
  }, 150)
}
