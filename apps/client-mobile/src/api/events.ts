import { DEFAULT_LIST_PAGE_SIZE, httpGet, httpPost } from './http'
import type { CheckinPayload, CheckinResult, CommunityEvent, EventEnrollmentResult, EventFeedbackPayload, EventTicket, MyEnrollmentItem, MyEventFeedback, PageResult } from '@/types'

/** GET /api/app/events — 活动中心；HTTP 模式由服务端执行状态和可见范围过滤。 */
export async function fetchEvents(query: { type?: string; keyword?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<CommunityEvent>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (query.type) qs.set('type', query.type)
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<PageResult<CommunityEvent>>(`/events?${qs}`)
}

/** GET /api/app/events/:id — 详情（人数限制/我的报名态） */
export async function fetchEvent(id: string): Promise<CommunityEvent> {
  return httpGet<CommunityEvent>(`/events/${id}`)
}

/** POST /api/app/events/:id/enroll — 报名（截止/容量/范围校验；满员进入候补） */
export async function enrollEvent(id: string): Promise<EventEnrollmentResult> {
  return httpPost<EventEnrollmentResult>(`/events/${id}/enroll`)
}

/** POST /api/app/events/:id/enroll/cancel — 取消报名（开始前 24 小时截止；释放名额自动递补候补） */
export async function cancelEnrollment(id: string): Promise<void> {
  await httpPost(`/events/${id}/enroll/cancel`)
}

/** 我的活动反馈（是否已评价）。 */
export async function fetchMyEventFeedback(eventId: string): Promise<MyEventFeedback | null> {
  return httpGet<MyEventFeedback | null>(`/events/${eventId}/feedback`)
}

/** 提交活动反馈（仅活动结束且参与过）。 */
export async function submitEventFeedback(eventId: string, payload: EventFeedbackPayload): Promise<void> {
  await httpPost(`/events/${eventId}/feedback`, payload)
}

/** GET /api/app/events/:id/ticket — 当前用户在该活动的电子票。 */
export async function fetchEventTicket(id: string): Promise<EventTicket> {
  return httpGet<EventTicket>(`/events/${id}/ticket`)
}

/** GET /api/app/me/enrollments — 我的报名 */
export async function fetchMyEnrollments(query: { page?: number; pageSize?: number } = {}): Promise<PageResult<MyEnrollmentItem>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  return httpGet<PageResult<MyEnrollmentItem>>(`/me/enrollments?${qs}`)
}

/** POST /api/app/events/:id/check-in — 签到；服务端校验围栏/签到码、时间窗、防重并发放积分。 */
export async function checkInEvent(id: string, payload: CheckinPayload): Promise<CheckinResult> {
  return httpPost<CheckinResult>(`/events/${id}/check-in`, payload)
}
