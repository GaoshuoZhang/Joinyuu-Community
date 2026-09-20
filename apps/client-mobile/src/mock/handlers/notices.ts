import type { UserNotice } from '@/types'
import { noticesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 站内信 handlers：列表、未读数和已读动作。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchNotices(page = 1, pageSize = 20): Promise<{ list: UserNotice[]; total: number }> {
  return withLatency(() => {
    const uid = requireUid()
    const all = [...(noticesByUid[uid] ?? [])].sort((a, b) => b.at.localeCompare(a.at))
    const start = (page - 1) * pageSize
    return { list: all.slice(start, start + pageSize), total: all.length }
  })
}

export async function fetchUnreadCount(): Promise<number> {
  return withLatency(() => {
    const uid = requireUid()
    return (noticesByUid[uid] ?? []).filter((n) => !n.read).length
  }, 100)
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
    for (const n of noticesByUid[uid] ?? []) {
      n.read = true
    }
  }, 150)
}
