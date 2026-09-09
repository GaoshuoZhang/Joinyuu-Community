import type {
  PageResult,
  Space,
  SpaceStatus,
  SpaceType,
  SpaceReservation,
  ApprovalRecord,
} from '@/types'
import { spaces, reservations, events } from '@/mock'
import { delay } from './utils'

/* 数据一致性约定：
 * - 空间名称被社区活动 location 引用（聚屿路演厅、共享会议室 A），重命名需同步活动数据（M1 服务端强约束）
 * - 使用看板 = 指定日期已通过预约 + 同名空间当日已发布社区活动，两源合并展示占用
 * - 预约审批流复用 ApprovalRecord 时间线（迁移自 applications 的 space 类型申请） */

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/* ---------- 空间管理 ---------- */

/* TODO: 替换为 GET /api/admin/spaces — 全量空间（按 ID 升序） */
export async function fetchSpaces(): Promise<Space[]> {
  await delay(300)
  return [...spaces].sort((a, b) => a.id.localeCompare(b.id))
}

/* TODO: 替换为 GET /api/admin/spaces/:id — 空间详情（详情页用） */
export async function fetchSpace(id: string): Promise<Space> {
  await delay(300)
  const space = spaces.find((s) => s.id === id)
  if (!space) throw new Error('空间不存在')
  /* 返回快照副本：修复详情页 load 后因引用不变导致不刷新的问题（M1 为真实 HTTP 序列化新对象） */
  return { ...space, equipment: [...space.equipment] }
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

/* TODO: 替换为 POST /api/admin/spaces — 创建空间（创建即可用 status=available） */
export async function createSpace(payload: SpacePayload): Promise<Space> {
  await delay(500)
  const maxNum = spaces.reduce((m, s) => Math.max(m, Number(s.id.replace('S', ''))), 0)
  const space: Space = {
    id: `S${maxNum + 1}`,
    name: payload.name,
    type: payload.type,
    capacity: payload.capacity,
    location: payload.location,
    openTime: payload.openTime,
    closeTime: payload.closeTime,
    allDay: payload.allDay,
    needReservation: payload.needReservation,
    needApproval: payload.needApproval,
    equipment: payload.equipment,
    status: 'available',
    description: payload.description,
  }
  spaces.push(space)
  return space
}

/* TODO: 替换为 PUT /api/admin/spaces/:id — 编辑空间基础信息（状态走独立接口） */
export async function updateSpace(id: string, payload: SpacePayload): Promise<{ code: number }> {
  await delay(400)
  const space = spaces.find((s) => s.id === id)
  if (!space) throw new Error('空间不存在')
  space.name = payload.name
  space.type = payload.type
  space.capacity = payload.capacity
  space.location = payload.location
  space.openTime = payload.openTime
  space.closeTime = payload.closeTime
  space.allDay = payload.allDay
  space.needReservation = payload.needReservation
  space.needApproval = payload.needApproval
  space.equipment = payload.equipment
  space.description = payload.description
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/spaces/:id/status — 空间置为维护/停用/恢复可用 */
export async function setSpaceStatus(id: string, status: SpaceStatus): Promise<{ code: number }> {
  await delay(350)
  const space = spaces.find((s) => s.id === id)
  if (!space) throw new Error('空间不存在')
  space.status = status
  return { code: 0 }
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

/* TODO: 替换为 GET /api/admin/space-reservations?page&pageSize&keyword&spaceId&status&date */
export async function fetchReservations(query: ReservationQuery): Promise<PageResult<SpaceReservation>> {
  await delay(400)
  let list = [...reservations]
  if (query.keyword) {
    const kw = query.keyword.trim().toLowerCase()
    list = list.filter(
      (r) =>
        r.userName.toLowerCase().includes(kw) ||
        r.spaceName.toLowerCase().includes(kw) ||
        r.id.toLowerCase().includes(kw),
    )
  }
  if (query.spaceId) list = list.filter((r) => r.spaceId === query.spaceId)
  if (query.status) list = list.filter((r) => r.status === query.status)
  if (query.date) list = list.filter((r) => r.date === query.date)
  list.sort((a, b) => Number(b.id.replace('SR', '')) - Number(a.id.replace('SR', '')))
  const total = list.length
  const start = (query.page - 1) * query.pageSize
  return { list: list.slice(start, start + query.pageSize), total }
}

/* TODO: 替换为 POST /api/admin/space-reservations/:id/review，入参 { status: approved | rejected, comment? }
 * 通过前服务端需校验时段冲突：同空间当日已通过预约 / 同名空间当日已发布社区活动（时段重叠即冲突） */
export async function reviewReservation(
  id: string,
  status: 'approved' | 'rejected',
  comment?: string,
): Promise<{ code: number }> {
  await delay(400)
  const reservation = reservations.find((r) => r.id === id)
  if (!reservation) throw new Error('空间预约不存在')
  if (reservation.status !== 'pending') throw new Error('该预约已处理，请勿重复审批')
  if (status === 'approved') {
    const clash = reservations.some(
      (r) =>
        r.id !== id &&
        r.spaceId === reservation.spaceId &&
        r.date === reservation.date &&
        r.status === 'approved' &&
        reservation.startTime < r.endTime &&
        r.startTime < reservation.endTime,
    )
    if (clash) throw new Error('该时段已有已通过的预约，无法重复占用')
    const space = spaces.find((s) => s.id === reservation.spaceId)
    const eventClash = events.some(
      (e) =>
        e.status === 'published' &&
        space !== undefined &&
        e.location === space.name &&
        e.startTime.slice(0, 10) === reservation.date &&
        reservation.startTime < e.endTime.slice(11, 16) &&
        e.startTime.slice(11, 16) < reservation.endTime,
    )
    if (eventClash) throw new Error('该时段被社区活动占用，无法通过')
  }
  reservation.status = status
  if (status === 'rejected') reservation.rejectReason = comment ?? ''
  const record: ApprovalRecord = {
    step: '管理员审批',
    operator: '社区管理员',
    action: status === 'approved' ? 'approve' : 'reject',
    comment: comment ?? (status === 'approved' ? '同意预约' : ''),
    at: formatNow(),
  }
  reservation.records.push(record)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/space-reservations/:id/cancel — 管理端取消预约（待审批/已通过均可取消） */
export async function cancelReservation(id: string): Promise<{ code: number }> {
  await delay(350)
  const reservation = reservations.find((r) => r.id === id)
  if (!reservation) throw new Error('空间预约不存在')
  if (reservation.status !== 'pending' && reservation.status !== 'approved')
    throw new Error('仅待审批或已通过的预约可取消')
  reservation.status = 'cancelled'
  return { code: 0 }
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

/* 使用看板：指定日期的空间占用视图 = 当日已通过预约 + 同名空间当日已发布社区活动
 * TODO: 替换为 GET /api/admin/spaces/usage-board?date */
export async function fetchSpaceUsageBoard(date: string): Promise<SpaceOccupancy[]> {
  await delay(350)
  const list: SpaceOccupancy[] = []
  for (const r of reservations) {
    if (r.status !== 'approved' || r.date !== date) continue
    list.push({
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      startTime: r.startTime,
      endTime: r.endTime,
      title: r.purpose,
      organizer: r.userName,
      source: 'reservation',
    })
  }
  for (const e of events) {
    if (e.status !== 'published') continue
    const space = spaces.find((s) => s.name === e.location)
    if (!space || e.startTime.slice(0, 10) !== date) continue
    list.push({
      spaceId: space.id,
      spaceName: space.name,
      startTime: e.startTime.slice(11, 16),
      endTime: e.endTime.slice(11, 16),
      title: `社区活动「${e.title}」`,
      organizer: e.host,
      source: 'event',
    })
  }
  list.sort((a, b) => a.spaceId.localeCompare(b.spaceId) || a.startTime.localeCompare(b.startTime))
  return list
}
