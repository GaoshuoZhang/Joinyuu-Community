import type {
  PageResult,
  Space,
  SpaceStatus,
  SpaceType,
  SpaceReservation,
} from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* ---------- 空间管理 ---------- */

/* 已接入 M1 真实接口：GET /api/admin/spaces — 全量空间（按 ID 升序） */
export async function fetchSpaces(): Promise<Space[]> {
  return httpGet<Space[]>('/spaces')
}

/* 已接入 M1 真实接口：GET /api/admin/spaces/:id — 空间详情（详情页用） */
export async function fetchSpace(id: string): Promise<Space> {
  return httpGet<Space>(`/spaces/${id}`)
}

export interface SpacePayload {
  name: string
  type: SpaceType
  capacity: number
  location: string
  openTime: string
  closeTime: string
  /** 全天开放（默认关闭） */
  allDay: boolean
  /** 是否需要预约（默认关闭） */
  needReservation: boolean
  /** 是否需要审批（needReservation 开启时有效） */
  needApproval: boolean
  equipment: string[]
  description: string
}

/* 已接入 M1 真实接口：POST /api/admin/spaces — 创建空间（创建即可用 status=available） */
export async function createSpace(payload: SpacePayload): Promise<Space> {
  return httpPost<Space>('/spaces', payload)
}

/* 已接入 M1 真实接口：PUT /api/admin/spaces/:id — 编辑空间基础信息（状态走独立接口） */
export async function updateSpace(id: string, payload: SpacePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/spaces/${id}`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/spaces/:id/status — 空间置为维护/停用/恢复可用 */
export async function setSpaceStatus(id: string, status: SpaceStatus): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/spaces/${id}/status`, { status })
}

/* ---------- 空间预约（含审批流） ---------- */

export interface ReservationQuery {
  page: number
  pageSize: number
  keyword?: string
  spaceId?: string
  status?: string
  /** 按预约日期筛选（YYYY-MM-DD） */
  date?: string
}

/* 已接入 M1 真实接口：GET /api/admin/space-reservations?page&pageSize&keyword&spaceId&status&date */
export async function fetchReservations(query: ReservationQuery): Promise<PageResult<SpaceReservation>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.spaceId) qs.set('spaceId', query.spaceId)
  if (query.status) qs.set('status', query.status)
  if (query.date) qs.set('date', query.date)
  return httpGet<PageResult<SpaceReservation>>(`/space-reservations?${qs}`)
}

/* 已接入 M1 真实接口：POST /api/admin/space-reservations/:id/review，入参 { status: approved | rejected, comment? }
 * 通过前服务端需校验时段冲突：同空间当日已通过预约 / 同名空间当日已发布社区活动（时段重叠即冲突） */
export async function reviewReservation(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/space-reservations/${id}/review`, { status, comment })
}

/* 已接入 M1 真实接口：POST /api/admin/space-reservations/:id/cancel — 管理端取消预约（待审批/已通过均可取消） */
export async function cancelReservation(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/space-reservations/${id}/cancel`)
}

/* ---------- 使用看板 ---------- */

export interface SpaceOccupancy {
  spaceId: string
  spaceName: string
  startTime: string
  endTime: string
  /** 占用内容：预约用途 / 社区活动名称 */
  title: string
  /** 预约人 / 活动主办方 */
  organizer: string
  source: 'reservation' | 'event'
}

/* 已接入 M1 真实接口：GET /api/admin/spaces/usage-board?date — 指定日期的空间占用视图 */
export async function fetchSpaceUsageBoard(date: string): Promise<SpaceOccupancy[]> {
  return httpGet<SpaceOccupancy[]>(`/spaces/usage-board?date=${date}`)
}
