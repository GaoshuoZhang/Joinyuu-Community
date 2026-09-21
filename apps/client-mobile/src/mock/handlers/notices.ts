import type { NoticePreferences, UserNotice } from '@/types'
import { noticesByUid, noticePreferencesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 站内信 handlers：列表、未读数和已读动作、通知偏好。 */

const NOTICE_TYPE_CATALOG: { type: string; label: string; mutable: boolean }[] = [
  { type: 'audit_result', label: '申请与审核结果', mutable: true },
  { type: 'demand', label: '需求动态', mutable: true },
  { type: 'project', label: '项目动态', mutable: true },
  { type: 'event', label: '活动动态', mutable: true },
  { type: 'mall', label: '商城与积分', mutable: true },
  { type: 'invite', label: '企业邀请', mutable: true },
  { type: 'transfer', label: '负责人转移', mutable: true },
  { type: 'content', label: '内容与投稿', mutable: true },
  { type: 'system', label: '系统与账号（不可关闭）', mutable: false },
]

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
    /* 浅拷贝避免视图原地修改污染 mock 库 */
    return { list: all.slice(start, start + pageSize).map((n) => ({ ...n })), total: all.length }
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

export async function fetchNoticePreferences(): Promise<NoticePreferences> {
  return withLatency(() => {
    const uid = requireUid()
    const muted = noticePreferencesByUid[uid] ?? []
    return {
      types: NOTICE_TYPE_CATALOG.map((item) => ({ ...item, muted: muted.includes(item.type) })),
      mutedTypes: [...muted],
    }
  }, 120)
}

export async function updateNoticePreferences(mutedTypes: string[]): Promise<NoticePreferences> {
  return withLatency(() => {
    const uid = requireUid()
    const mutable = new Set(NOTICE_TYPE_CATALOG.filter((item) => item.mutable).map((item) => item.type))
    const invalid = mutedTypes.find((type) => !mutable.has(type))
    if (invalid) fail(400, '通知类型不支持静音')
    const next = [...new Set(mutedTypes)]
    noticePreferencesByUid[uid] = next
    return {
      types: NOTICE_TYPE_CATALOG.map((item) => ({ ...item, muted: next.includes(item.type) })),
      mutedTypes: next,
    }
  }, 150)
}

