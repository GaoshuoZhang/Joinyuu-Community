import { apiMode, httpGet, httpPost } from './http'
import type { CheckinPayload, CommunityEvent, EventFeedbackPayload, EventTicket, MyEnrollmentItem, MyEventFeedback } from '@/types'
import * as mock from '@/mock/handlers/events'

/** GET /api/app/events — 活动中心（published 且未结束；可见范围过滤为缺口 §7-9） */
export async function fetchEvents(query: { type?: string; keyword?: string } = {}): Promise<CommunityEvent[]> {
  if (apiMode === 'mock') return mock.fetchEvents(query)
  const qs = new URLSearchParams()
  if (query.type) qs.set('type', query.type)
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<CommunityEvent[]>(`/events?${qs}`)
}

/** GET /api/app/events/:id — 详情（报名进度/我的报名态） */
export async function fetchEvent(id: string): Promise<CommunityEvent> {
  if (apiMode === 'mock') return mock.fetchEvent(id)
  return httpGet<CommunityEvent>(`/events/${id}`)
}

/** POST /api/app/events/:id/enroll — 报名（截止/容量/范围校验；满员进入候补） */
export async function enrollEvent(id: string): Promise<{ status: 'approved' | 'pending' | 'waitlisted' }> {
  if (apiMode === 'mock') return mock.enrollEvent(id)
  return httpPost<{ status: 'approved' | 'pending' | 'waitlisted' }>(`/events/${id}/enroll`)
}

/** POST /api/app/events/:id/enroll/cancel — 取消报名（开始前 24 小时截止；释放名额自动递补候补） */
export async function cancelEnrollment(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.cancelEnrollment(id)
  await httpPost(`/events/${id}/enroll/cancel`)
}

/** [MOCK-ONLY] v38 我的活动反馈（是否已评价） */
export async function fetchMyEventFeedback(eventId: string): Promise<MyEventFeedback | null> {
  if (apiMode === 'mock') return mock.fetchMyEventFeedback(eventId)
  return httpGet<MyEventFeedback | null>(`/events/${eventId}/feedback/me`)
}

/** [MOCK-ONLY] v38 提交活动反馈（结束后 + 参与过） */
export async function submitEventFeedback(eventId: string, payload: EventFeedbackPayload): Promise<void> {
  if (apiMode === 'mock') return mock.submitEventFeedback(eventId, payload)
  await httpPost(`/events/${eventId}/feedback`, payload)
}

/** GET /api/app/events/:id/ticket — 活动电子票（v42 [MOCK-ONLY]） */
export async function fetchEventTicket(id: string): Promise<EventTicket> {
  if (apiMode === 'mock') return mock.fetchEventTicket(id)
  return httpGet<EventTicket>(`/events/${id}/ticket`)
}

/** GET /api/app/me/enrollments — 我的报名 */
export async function fetchMyEnrollments(): Promise<MyEnrollmentItem[]> {
  if (apiMode === 'mock') return mock.fetchMyEnrollments()
  return httpGet<MyEnrollmentItem[]>('/me/enrollments')
}

/** [MOCK-ONLY] POST /api/app/events/:id/check-in — 签到（缺口 §7.1-2：围栏 + 时间窗 + 防重复 + activity_checkin 积分） */
export async function checkInEvent(id: string, payload: CheckinPayload): Promise<{ pointsAwarded: number }> {
  if (apiMode === 'mock') return mock.checkInEvent(id, payload)
  return httpPost<{ pointsAwarded: number }>(`/events/${id}/check-in`, payload)
}
