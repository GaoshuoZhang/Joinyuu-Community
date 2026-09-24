import type {
  PageResult,
  Space,
  SpaceStatus,
  SpaceType,
  SpaceReservation,
} from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* ---------- 空间管理 ---------- */

/* GET /api/admin/spaces — 全量空间（按 ID 升序） */
export async function fetchSpaces(): Promise<Space[]> {
  return httpGet<Space[]>('/spaces')
}

/* GET /api/admin/spaces/:id — 空间详情（详情页用） */
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
  /** 是否需要审核（needReservation 开启时有效） */
  needApproval: boolean
  /** 预约费用（积分/小时）；0 = 免费使用 */
  feePerHour: number
  equipment: string[]
  description: string
}

/* POST /api/admin/spaces — 新增空间（新增即可用 status=available） */
export async function createSpace(payload: SpacePayload): Promise<Space> {
  return httpPost<Space>('/spaces', payload)
}

/* PUT /api/admin/spaces/:id — 编辑空间基础信息（状态走独立接口） */
export async function updateSpace(id: string, payload: SpacePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/spaces/${id}`, payload)
}

/* POST /api/admin/spaces/:id/status — 空间置为维护/停用/恢复可用 */
export async function setSpaceStatus(id: string, status: SpaceStatus): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/spaces/${id}/status`, { status })
}

/* ---------- 空间预约（含审核流） ---------- */

export interface ReservationQuery {
  page: number
  pageSize: number
  keyword?: string
  spaceId?: string
  status?: string
  /** 按预约日期筛选（YYYY-MM-DD） */
  date?: string
}

/* GET /api/admin/space-reservations?page&pageSize&keyword&spaceId&status&date */
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

/* POST /api/admin/space-reservations/:id/review，入参 { status: approved | rejected, comment? }
 * 通过前服务端需校验时段冲突：同空间当日已通过预约 / 同名空间当日已发布社区活动（时段重叠即冲突） */
export async function reviewReservation(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/space-reservations/${id}/review`, { status, comment })
}

/* POST /api/admin/space-reservations/:id/cancel — 管理端取消预约（待审核/已通过均可取消） */
export async function cancelReservation(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/space-reservations/${id}/cancel`)
}

/* POST /api/admin/space-reservations/:id/archive — 归档已结束/已驳回/已取消预约（可在归档管理中恢复） */
export async function archiveReservation(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/space-reservations/${id}/archive`)
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

/* GET /api/admin/spaces/usage-board?date — 指定日期的空间占用视图 */
export async function fetchSpaceUsageBoard(date: string): Promise<SpaceOccupancy[]> {
  return httpGet<SpaceOccupancy[]>(`/spaces/usage-board?date=${date}`)
}

/* ---------- 空间的活动占用（详情页日历/明细用） ---------- */

/** 活动占用项：按日展开，startTime/endTime 为该日的占用时段（跨天活动按天裁剪） */
export interface SpaceEventOccupancy {
  eventId: string
  date: string
  startTime: string
  endTime: string
  title: string
  host: string
}

/* GET /api/admin/spaces/:id/event-occupancy — 空间名/地址命中的已发布活动（与客户端可约时段同一口径） */
export async function fetchSpaceEventOccupancy(spaceId: string): Promise<SpaceEventOccupancy[]> {
  return httpGet<SpaceEventOccupancy[]>(`/spaces/${spaceId}/event-occupancy`)
}
