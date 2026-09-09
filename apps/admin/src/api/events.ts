import type { PageResult, CommunityEvent } from '@/types'
import { events } from '@/mock'
import { delay } from './utils'

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

/* 定时发布模拟：到点自动转为已发布（真实系统为服务端定时任务）
 * 已结束模拟：已发布活动过了结束时间自动转为已结束 */
function nowStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function simulateScheduledPublish() {
  const now = nowStr()
  for (const e of events) {
    if (e.status === 'scheduled' && e.scheduledAt && e.scheduledAt <= now) {
      e.status = 'published'
      e.enrollmentOpen = true
    }
  }
}

function simulateEnded() {
  const now = nowStr()
  for (const e of events) {
    if (e.status === 'published' && e.endTime <= now) e.status = 'ended'
  }
}

/* TODO: 替换为 GET /api/admin/events?page&pageSize&keyword&type&status */
export async function fetchEvents(query: EventQuery): Promise<PageResult<CommunityEvent>> {
  await delay(400)
  simulateScheduledPublish()
  let list = [...events]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter((e) => e.title.toLowerCase().includes(kw) || e.id.toLowerCase().includes(kw))
  }
  if (query.type) list = list.filter((e) => e.type === query.type)
  if (query.status) list = list.filter((e) => e.status === query.status)
  if (query.participant) list = list.filter((e) => e.enrollments.some((en) => en.userId === query.participant))
  /* 排序：默认按 ID 倒序（最新创建在前）；可按开始时间排序 */
  const field = query.sortBy ?? 'id'
  const dir = query.sortOrder === 'ascend' ? 1 : -1
  list.sort((a, b) => {
    const av = field === 'id' ? Number(a.id.replace('EV', '')) : a.startTime
    const bv = field === 'id' ? Number(b.id.replace('EV', '')) : b.startTime
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 GET /api/admin/events/:id */
export async function fetchEvent(id: string): Promise<CommunityEvent> {
  await delay(300)
  simulateScheduledPublish()
  simulateEnded()
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  /* 返回快照副本：修复详情页 load 后因引用不变导致表格不刷新的问题（M1 为真实 HTTP 序列化新对象） */
  return { ...event, enrollments: event.enrollments.map((en) => ({ ...en })) }
}

/* TODO: 替换为 POST /api/admin/events/:id/enrollments/:userId/review，入参 { status: approved | rejected } */
export async function reviewEventEnrollment(
  eventId: string,
  userId: string,
  status: 'approved' | 'rejected',
): Promise<{ code: number }> {
  await delay(350)
  const event = events.find((e) => e.id === eventId)
  if (!event) throw new Error('活动不存在')
  const enrollment = event.enrollments.find((e) => e.userId === userId)
  if (!enrollment) throw new Error('报名记录不存在')
  enrollment.status = status
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/events/:id/checkin，入参 { userId } — 管理端手动签到 */
export async function checkInEvent(eventId: string, userId: string): Promise<{ code: number }> {
  await delay(300)
  const event = events.find((e) => e.id === eventId)
  if (!event) throw new Error('活动不存在')
  const enrollment = event.enrollments.find((e) => e.userId === userId)
  if (!enrollment) throw new Error('报名记录不存在')
  if (!enrollment.checkedIn) {
    enrollment.checkedIn = true
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    enrollment.checkInAt = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  return { code: 0 }
}

/* ---------- 状态流转：待发布 / 定时发布中 / 已发布（报名中|暂停报名）/ 已结束 / 已取消 ---------- */

/* TODO: 替换为 POST /api/admin/events/:id/publish-now — 待发布活动立即发布（开放报名） */
export async function publishEventNow(id: string): Promise<{ code: number }> {
  await delay(350)
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  if (event.status !== 'pending_release') throw new Error('仅待发布的活动可立即发布')
  event.status = 'published'
  event.enrollmentOpen = true
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/events/:id/schedule — 待发布活动设定定时发布时间，转为定时发布中 */
export async function scheduleEvent(id: string, scheduledAt: string): Promise<{ code: number }> {
  await delay(400)
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  if (event.status !== 'pending_release') throw new Error('仅待发布的活动可设定时发布')
  event.status = 'scheduled'
  event.scheduledAt = scheduledAt
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/events/:id/cancel-schedule — 取消定时发布，转回待发布 */
export async function cancelEventSchedule(id: string): Promise<{ code: number }> {
  await delay(350)
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  if (event.status !== 'scheduled') throw new Error('仅定时发布中的活动可取消定时')
  event.status = 'pending_release'
  event.scheduledAt = undefined
  return { code: 0 }
}

/* TODO: 替换为 PATCH /api/admin/events/:id/enrollment — 已发布活动暂停/开放报名 */
export async function toggleEventEnrollment(id: string): Promise<{ code: number }> {
  await delay(350)
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  if (event.status !== 'published') throw new Error('仅已发布的活动可调整报名')
  event.enrollmentOpen = !event.enrollmentOpen
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/events/:id/cancel — 取消活动（待发布/已发布 → 已取消） */
/* TODO: 替换为 POST /api/admin/events/:id/restore — 已取消活动转为待发布 */
export async function restoreCancelledEvent(id: string): Promise<{ code: number }> {
  await delay(400)
  const event = events.find((x) => x.id === id)
  if (!event) throw new Error('活动不存在')
  if (event.status !== 'cancelled') throw new Error('仅已取消的活动可转为待发布')
  event.status = 'pending_release'
  return { code: 0 }
}

export async function cancelEvent(id: string): Promise<{ code: number }> {
  await delay(350)
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  if (event.status !== 'pending_release' && event.status !== 'published') throw new Error('该状态下不可取消活动')
  event.status = 'cancelled'
  return { code: 0 }
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

/* TODO: 替换为 POST /api/admin/events — 创建活动（无定时发布选项，创建即进入待发布） */
export async function createEvent(payload: EventPayload): Promise<CommunityEvent> {
  await delay(500)
  const maxNum = events.reduce((m, e) => Math.max(m, Number(e.id.replace('EV', ''))), 0)
  const event: CommunityEvent = {
    id: `EV${maxNum + 1}`,
    createdAt: nowStr(),
    title: payload.title,
    type: payload.type,
    startTime: payload.startTime,
    endTime: payload.endTime,
    location: payload.location,
    capacity: payload.capacity,
    speaker: payload.speaker,
    host: payload.host,
    status: 'pending_release',
    visibilityIdentities: payload.visibilityIdentities as CommunityEvent['visibilityIdentities'],
    visibilityLevels: payload.visibilityLevels,
    enrollmentIdentities: payload.enrollmentIdentities as CommunityEvent['enrollmentIdentities'],
    enrollmentLevels: payload.enrollmentLevels,
    requireReview: payload.requireReview,
    enrollmentDeadline: payload.enrollmentDeadline ?? '',
    enrollPoints: payload.enrollPoints,
    checkinPoints: payload.checkinPoints,
    description: payload.description,
    tags: payload.tags,
    enrollments: [],
    enrollmentOpen: true,
  }
  events.push(event)
  return event
}

/* TODO: 替换为 PUT /api/admin/events/:id — 活动再编辑（不改状态与已有报名数据） */
export async function updateEvent(id: string, payload: EventPayload): Promise<{ code: number }> {
  await delay(400)
  const event = events.find((e) => e.id === id)
  if (!event) throw new Error('活动不存在')
  event.title = payload.title
  event.type = payload.type
  event.startTime = payload.startTime
  event.endTime = payload.endTime
  event.location = payload.location
  event.capacity = payload.capacity
  event.speaker = payload.speaker
  event.host = payload.host
  event.description = payload.description
  event.tags = payload.tags
  event.enrollPoints = payload.enrollPoints
  event.checkinPoints = payload.checkinPoints
  event.visibilityIdentities = payload.visibilityIdentities as CommunityEvent['visibilityIdentities']
  event.visibilityLevels = payload.visibilityLevels
  event.enrollmentIdentities = payload.enrollmentIdentities as CommunityEvent['enrollmentIdentities']
  event.enrollmentLevels = payload.enrollmentLevels
  event.requireReview = payload.requireReview
  event.enrollmentDeadline = payload.enrollmentDeadline ?? ''
  return { code: 0 }
}
