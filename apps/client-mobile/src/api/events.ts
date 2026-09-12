import { apiMode, httpGet, httpPost } from './http'
import type { CheckinPayload, CommunityEvent, MyEnrollmentItem } from '@/types'
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

/** POST /api/app/events/:id/enroll — 报名（截止/容量/范围校验；requireReview 进 pending） */
export async function enrollEvent(id: string): Promise<{ status: 'approved' | 'pending' }> {
  if (apiMode === 'mock') return mock.enrollEvent(id)
  return httpPost<{ status: 'approved' | 'pending' }>(`/events/${id}/enroll`)
}

/** POST /api/app/events/:id/enroll/cancel — 取消报名（approved 释放名额） */
export async function cancelEnrollment(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.cancelEnrollment(id)
  await httpPost(`/events/${id}/enroll/cancel`)
}

/** GET /api/app/me/enrollments — 我的报名 */
export async function fetchMyEnrollments(): Promise<MyEnrollmentItem[]> {
  if (apiMode === 'mock') return mock.fetchMyEnrollments()
  return httpGet<MyEnrollmentItem[]>('/me/enrollments')
}

/** [MOCK-ONLY] POST /api/app/events/:id/check-in — 位置签到（缺口 §7.1-2：围栏 + 时间窗 + 防重复 + activity_checkin 积分） */
export async function checkInEvent(id: string, payload: CheckinPayload): Promise<{ pointsAwarded: number }> {
  if (apiMode === 'mock') return mock.checkInEvent(id, payload)
  return httpPost<{ pointsAwarded: number }>(`/events/${id}/check-in`, payload)
}
