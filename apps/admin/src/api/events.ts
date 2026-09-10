import type { PageResult, CommunityEvent } from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

export interface EventQuery {
  page: number
  pageSize: number
  keyword?: string
  type?: string
  status?: string
  /** 按报名人筛选（用户详情数据概览跳转） */
  participant?: string
  /** 排序字段：id | startTime | createdAt */
  sortBy?: 'id' | 'startTime' | 'createdAt'
  /** 排序方向：descend 默认（最新在前） | ascend */
  sortOrder?: 'ascend' | 'descend'
}

/* 已接入 M1 真实接口：GET /api/admin/events?page&pageSize&keyword&type&status&participant&sortBy&sortOrder */
export async function fetchEvents(query: EventQuery): Promise<PageResult<CommunityEvent>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.type) qs.set('type', query.type)
  if (query.status) qs.set('status', query.status)
  if (query.participant) qs.set('participant', query.participant)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<CommunityEvent>>(`/events?${qs}`)
}

/* 已接入 M1 真实接口：GET /api/admin/events/:id */
export async function fetchEvent(id: string): Promise<CommunityEvent> {
  return httpGet<CommunityEvent>(`/events/${id}`)
}

/* 已接入 M1 真实接口：POST /api/admin/events/:id/enrollments/:userId/review，入参 { status: approved | rejected } */
export async function reviewEventEnrollment(
  eventId: string,
  userId: string,
  status: 'approved' | 'rejected',
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${eventId}/enrollments/${userId}/review`, { status })
}

/* 已接入 M1 真实接口：POST /api/admin/events/:id/checkin，入参 { userId } — 管理端手动签到 */
export async function checkInEvent(eventId: string, userId: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${eventId}/checkin`, { userId })
}

/* ---------- 状态流转：待发布 / 定时发布中 / 已发布（报名中|暂停报名）/ 已结束 / 已取消 ---------- */

/* 已接入 M1 真实接口：POST /api/admin/events/:id/publish-now — 待发布活动立即发布（开放报名） */
export async function publishEventNow(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/publish-now`)
}

/* 已接入 M1 真实接口：POST /api/admin/events/:id/schedule — 待发布活动设定定时发布时间，转为定时发布中 */
export async function scheduleEvent(id: string, scheduledAt: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/schedule`, { scheduledAt })
}

/* 已接入 M1 真实接口：POST /api/admin/events/:id/cancel-schedule — 取消定时发布，转回待发布 */
export async function cancelEventSchedule(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/cancel-schedule`)
}

/* 已接入 M1 真实接口：PATCH /api/admin/events/:id/enrollment — 已发布活动暂停/开放报名 */
export async function toggleEventEnrollment(id: string): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/events/${id}/enrollment`)
}

/* 已接入 M1 真实接口：POST /api/admin/events/:id/cancel — 取消活动（待发布/已发布 → 已取消） */
export async function cancelEvent(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/cancel`)
}

/* 已接入 M1 真实接口：POST /api/admin/events/:id/restore — 已取消活动转为待发布 */
export async function restoreCancelledEvent(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/events/${id}/restore`)
}

/* ---------- 创建 / 编辑 ---------- */

export interface EventPayload {
  title: string
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
  /** 自定义报名奖励积分（缺省 = 按积分规则发放） */
  enrollPoints?: number
  /** 自定义签到奖励积分（缺省 = 按积分规则发放） */
  checkinPoints?: number
}

/* 已接入 M1 真实接口：POST /api/admin/events — 创建活动（无定时发布选项，创建即进入待发布） */
export async function createEvent(payload: EventPayload): Promise<CommunityEvent> {
  return httpPost<CommunityEvent>('/events', payload)
}

/* 已接入 M1 真实接口：PUT /api/admin/events/:id — 活动再编辑（不改状态与已有报名数据） */
export async function updateEvent(id: string, payload: EventPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/events/${id}`, payload)
}
