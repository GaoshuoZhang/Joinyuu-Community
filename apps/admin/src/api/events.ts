import type { PageResult, CommunityEvent, EventEnrollmentRecord } from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

export interface EventQuery {
  page: number
  pageSize: number
  keyword?: string
  type?: string
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  /** 按报名人筛选（用户详情数据概览跳转） */
  participant?: string
  /** 排序字段：id | startTime | createdAt */
  sortBy?: 'id' | 'startTime' | 'createdAt'
  /** 排序方向：descend 默认（最新在前） | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* GET /api/admin/events?page&pageSize&keyword&type&status&participant&sortBy&sortOrder */
export async function fetchEvents(query: EventQuery): Promise<PageResult<CommunityEvent>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.type) qs.set('type', query.type)
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  if (query.participant) qs.set('participant', query.participant)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<CommunityEvent>>(`/events?${qs}`)
}

/* GET /api/admin/events/:id */
export async function fetchEvent(id: string): Promise<CommunityEvent> {
  return httpGet<CommunityEvent>(`/events/${id}`)
}

export interface EventEnrollmentQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  eventId?: string
}

/* GET /api/admin/events/enrollments?page&pageSize&keyword&status&eventId */
export async function fetchEventEnrollments(query: EventEnrollmentQuery): Promise<PageResult<EventEnrollmentRecord>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.status) qs.set('status', query.status)
  if (query.eventId) qs.set('eventId', query.eventId)
  return httpGet<PageResult<EventEnrollmentRecord>>(`/events/enrollments?${qs}`)
}

/* POST /api/admin/events/:id/enrollments/:userId/review，入参 { status: approved | rejected, reason? }（驳回必填原因） */
export async function reviewEventEnrollment(
  eventId: string,
  userId: string,
  status: 'approved' | 'rejected',
  reason?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${eventId}/enrollments/${userId}/review`, {
    status,
    ...(status === 'rejected' ? { reason: reason?.trim() ?? '' } : {}),
  })
}

/* POST /api/admin/events/:id/checkin，入参 { userId } — 管理端手动签到 */
export async function checkInEvent(eventId: string, userId: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${eventId}/checkin`, { userId })
}

export interface EventTicketRow {
  ticketNo: string
  redeemCode: string
  userId: string
  userName: string
  redeemedAt?: string
}

export async function fetchEventTickets(eventId: string): Promise<EventTicketRow[]> {
  return httpGet<EventTicketRow[]>(`/events/${eventId}/tickets`)
}

export async function redeemEventTicket(eventId: string, code: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${eventId}/tickets/redeem`, { code })
}

/* ---------- 状态流转：待发布 / 定时发布中 / 已发布（报名中|暂停报名）/ 已结束 / 已取消 ---------- */

/* POST /api/admin/events/:id/publish-now — 待发布活动立即发布（开放报名） */
export async function publishEventNow(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/publish-now`)
}

/* POST /api/admin/events/:id/schedule — 待发布活动设定定时发布时间，转为定时发布中 */
export async function scheduleEvent(id: string, scheduledAt: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/schedule`, { scheduledAt })
}

/* POST /api/admin/events/:id/cancel-schedule — 取消定时发布，转回待发布 */
export async function cancelEventSchedule(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/cancel-schedule`)
}

/* PATCH /api/admin/events/:id/enrollment — 已发布活动显式设置报名开关（幂等） */
export async function setEventEnrollment(id: string, enrollmentOpen: boolean): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/events/${id}/enrollment`, { enrollmentOpen })
}

/* POST /api/admin/events/:id/cancel — 取消活动（待发布/已发布 → 已取消） */
export async function cancelEvent(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/cancel`)
}

/* POST /api/admin/events/:id/restore — 已取消活动转为待发布 */
export async function restoreCancelledEvent(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/restore`)
}

export async function rescheduleEvent(
  id: string,
  payload: { startTime: string; endTime: string; reason: string },
): Promise<{ notified: number }> {
  return httpPost<{ notified: number }>(`/events/${id}/reschedule`, payload)
}

/* POST /api/admin/events/:id/archive — 归档已结束/已取消活动（可在归档管理中恢复） */
export async function archiveEvent(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/archive`)
}

/* ---------- 新增 / 编辑 ---------- */

export interface EventPayload {
  title: string
  coverUrl?: string
  type: string
  startTime: string
  endTime: string
  location: string
  capacity: number
  speaker: string
  host: string
  description: string
  tags: string[]
  visibilityIdentities: string[]
  visibilityLevels: string[]
  enrollmentIdentities: string[]
  enrollmentLevels: string[]
  requireReview: boolean
  /** 报名截止时间（空 = 不限，活动开始前均可报名） */
  enrollmentDeadline?: string
  /** 报名奖励积分（历史缺省值按积分规则发放） */
  enrollPoints?: number
  /** 签到奖励积分（历史缺省值按积分规则发放） */
  checkinPoints?: number
  venueLat?: string
  venueLng?: string
  checkinRadiusM?: number
  checkinOpenMin?: number
  checkinCloseMin?: number
  /** 签到校验位置开关：开启后客户端签到做地理围栏校验（默认关） */
  checkinLocationRequired?: boolean
  /** 签到校验码开关（默认开）：关闭后不再要求输入签到码 */
  checkinCodeRequired?: boolean
  /** 6 位数字签到码（留空保存由服务端自动生成；required=false 时服务端置空） */
  checkinCode?: string
  cancelDeadlineHours?: number
}

/* POST /api/admin/events — 新增活动（无定时发布选项，新增即进入待发布） */
export async function createEvent(payload: EventPayload): Promise<CommunityEvent> {
  return httpPost<CommunityEvent>('/events', payload)
}

/* PUT /api/admin/events/:id — 活动再编辑（不改状态与已有报名数据） */
export async function updateEvent(id: string, payload: EventPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/events/${id}`, payload)
}
