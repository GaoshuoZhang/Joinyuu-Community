import type { NoticeType, UserNotice } from '@/types'
import { ALL_NOTICE_TYPES, noticePrefsByUid, noticesByUid } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 站内信 handlers——缺口 §7-1（UserNotification 模型 + 端点 + 触发点），接入期实现并销号。
 * v38：新增通知偏好（启用的类型集合；Mock 中同时用于列表过滤，真实后端用于推送开关）。
 * v40：未读数/全部已读与列表口径统一（排除已归档与已关闭偏好的类型）。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

function enabledTypes(uid: string): NoticeType[] {
  return noticePrefsByUid[uid] ?? ALL_NOTICE_TYPES
}

export async function fetchNotices(): Promise<UserNotice[]> {
  return withLatency(() => {
    const uid = requireUid()
    const enabled = enabledTypes(uid)
    return [...(noticesByUid[uid] ?? [])]
      .filter((notice) => enabled.includes(notice.type))
      .sort((a, b) => b.at.localeCompare(a.at))
  })
}

/** v39：归档 / 恢复单条通知（归档后不在常规列表展示） */
export async function archiveNotice(id: string, archived: boolean): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const notice = (noticesByUid[uid] ?? []).find((item) => item.id === id)
    if (!notice) fail(404, '通知不存在')
    if (archived) notice.archived = true
    else delete notice.archived
  }, 120)
}

export async function fetchNoticePrefs(): Promise<NoticeType[]> {
  return withLatency(() => enabledTypes(requireUid()), 100)
}

export async function updateNoticePrefs(types: NoticeType[]): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const valid = types.filter((type) => ALL_NOTICE_TYPES.includes(type))
    if (!valid.length) fail(400, '至少保留一种通知类型')
    noticePrefsByUid[uid] = valid
  }, 140)
}

export async function fetchUnreadCount(): Promise<number> {
  /* v40 修复：未读数与列表口径一致（排除已归档与已关闭偏好的类型） */
  return withLatency(() => {
    const uid = requireUid()
    const enabled = enabledTypes(uid)
    return (noticesByUid[uid] ?? []).filter((n) => !n.read && !n.archived && enabled.includes(n.type)).length
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
    const enabled = enabledTypes(uid)
    /* v40：仅标记列表可见（未归档 + 已启用类型）的通知 */
    for (const n of noticesByUid[uid] ?? []) {
      if (!n.archived && enabled.includes(n.type)) n.read = true
    }
  }, 150)
}
