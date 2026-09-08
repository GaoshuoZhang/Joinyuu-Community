import type { Lease, LeaseRenterType, RentPeriod, Workstation, WorkstationArea, WorkstationType } from '@/types'
import { workstations, workstationAreas, leases, enterprises, users } from '@/mock'
import { delay } from './utils'

/* 数据一致性约定：
 * - 租约创建/终止与工位状态联动：创建锁定工位（assigned + 企业 + leaseId），终止释放工位（idle 并清空）
 * - 租约状态：active/terminated 为原始存储值；expiring/expired 由结束日期在读取时派生（M1 转服务端定时任务） */

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* ---------- 工位 ---------- */

/* TODO: 替换为 GET /api/admin/workstations — 全量工位（含平面图分组所需 area/type 字段） */
export async function fetchWorkstations(): Promise<Workstation[]> {
  await delay(300)
  return [...workstations].sort((a, b) => a.id.localeCompare(b.id))
}

/* ---------- 区域规划 ---------- */

/* TODO: 替换为 GET /api/admin/workstation-areas — 工位区域列表（区域规划） */
export async function fetchWorkstationAreas(): Promise<WorkstationArea[]> {
  await delay(250)
  return [...workstationAreas].sort((a, b) => a.id.localeCompare(b.id))
}

export interface WorkstationAreaPayload {
  name: string
  type: WorkstationType
  description: string
}

/* TODO: 替换为 POST /api/admin/workstation-areas — 新增区域（名称唯一；WA1001+ 前缀） */
export async function createWorkstationArea(payload: WorkstationAreaPayload): Promise<WorkstationArea> {
  await delay(400)
  if (workstationAreas.some((a) => a.name === payload.name.trim())) throw new Error('区域名称已存在')
  const maxNum = workstationAreas.reduce((m, a) => Math.max(m, Number(a.id.replace('WA', ''))), 0)
  const area: WorkstationArea = {
    id: `WA${maxNum + 1}`,
    name: payload.name,
    type: payload.type,
    description: payload.description,
    createdAt: formatToday(),
  }
  workstationAreas.push(area)
  return area
}

/* TODO: 替换为 PUT /api/admin/workstation-areas/:id — 编辑区域；改名时级联刷新该区域下所有工位的 area 冗余字段
 * （M1 工位表建议改存 areaId 外键后无需级联） */
export async function updateWorkstationArea(id: string, payload: WorkstationAreaPayload): Promise<{ code: number }> {
  await delay(400)
  const area = workstationAreas.find((a) => a.id === id)
  if (!area) throw new Error('区域不存在')
  if (workstationAreas.some((a) => a.id !== id && a.name === payload.name.trim()))
    throw new Error('区域名称已存在')
  const oldName = area.name
  area.name = payload.name
  area.type = payload.type
  area.description = payload.description
  if (oldName !== area.name) {
    for (const w of workstations) if (w.area === oldName) w.area = area.name
  }
  return { code: 0 }
}

/* TODO: 替换为 DELETE /api/admin/workstation-areas/:id — 删除区域（仅允许删除区域下无工位时） */
export async function deleteWorkstationArea(id: string): Promise<{ code: number }> {
  await delay(350)
  const area = workstationAreas.find((a) => a.id === id)
  if (!area) throw new Error('区域不存在')
  if (workstations.some((w) => w.area === area.name))
    throw new Error('该区域下仍有工位，无法删除；请先移出或删除区域内全部工位')
  workstationAreas.splice(workstationAreas.findIndex((a) => a.id === id), 1)
  return { code: 0 }
}

/* ---------- 工位创建 / 资料编辑 ---------- */

export interface WorkstationPayload {
  area: string
  seatNo: string
  type: WorkstationType
  capacity: number
  note?: string
  /** 默认月租（元）：创建租约选"月租"时自动累加；非必填 */
  defaultMonthlyRent?: number
  /** 面积（㎡）：仅独立办公室；非必填 */
  areaSqm?: number
}

/* TODO: 替换为 POST /api/admin/workstations — 创建工位（编号全岛唯一，创建即空闲） */
export async function createWorkstation(payload: WorkstationPayload): Promise<Workstation> {
  await delay(450)
  if (!workstationAreas.some((a) => a.name === payload.area)) throw new Error('所属区域不存在，请先在区域规划中添加')
  if (workstations.some((w) => w.seatNo === payload.seatNo.trim())) throw new Error('工位编号已存在')
  const maxNum = workstations.reduce((m, w) => Math.max(m, Number(w.id.replace('WS', ''))), 0)
  const ws: Workstation = {
    id: `WS${maxNum + 1}`,
    seatNo: payload.seatNo,
    area: payload.area,
    type: payload.type,
    capacity: payload.capacity,
    status: 'idle',
    note: payload.note || undefined,
    defaultMonthlyRent: payload.defaultMonthlyRent ?? undefined,
    areaSqm: payload.type === 'office' ? payload.areaSqm ?? undefined : undefined,
  }
  workstations.push(ws)
  return ws
}

/* TODO: 替换为 PUT /api/admin/workstations/:id — 编辑工位资料（区域/编号/类型/容纳人数/备注）；
 * 分配关系与维护状态不在资料编辑中变更（分配走租约、维护走编辑弹窗内的维护开关） */
export async function updateWorkstation(id: string, payload: WorkstationPayload): Promise<{ code: number }> {
  await delay(400)
  const ws = workstations.find((w) => w.id === id)
  if (!ws) throw new Error('工位不存在')
  if (!workstationAreas.some((a) => a.name === payload.area)) throw new Error('所属区域不存在，请先在区域规划中添加')
  if (workstations.some((w) => w.id !== id && w.seatNo === payload.seatNo.trim()))
    throw new Error('工位编号已存在')
  ws.area = payload.area
  ws.seatNo = payload.seatNo
  ws.type = payload.type
  ws.capacity = payload.capacity
  ws.note = payload.note || undefined
  ws.defaultMonthlyRent = payload.defaultMonthlyRent ?? undefined
  ws.areaSqm = payload.type === 'office' ? payload.areaSqm ?? undefined : undefined
  return { code: 0 }
}

/* TODO: 替换为 DELETE /api/admin/workstations/:id — 删除工位（已分配工位不可删除，需先终止租约；
 * 维护中/空闲工位可直接删除；删除后租约 workstationIds 由服务端保证一致性） */
export async function deleteWorkstation(id: string): Promise<{ code: number }> {
  await delay(400)
  const ws = workstations.find((w) => w.id === id)
  if (!ws) throw new Error('工位不存在')
  if (ws.status === 'assigned') throw new Error('该工位已分配企业，请先终止对应租约后再删除')
  workstations.splice(workstations.indexOf(ws), 1)
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/workstations/:id/status — 维修登记/恢复，入参 { status: idle | maintenance }；
 * 已分配工位不可直接标记维修，需先终止对应租约释放工位 */
export async function setWorkstationStatus(
  id: string,
  status: 'idle' | 'maintenance',
): Promise<{ code: number }> {
  await delay(350)
  const ws = workstations.find((w) => w.id === id)
  if (!ws) throw new Error('工位不存在')
  if (ws.status === 'assigned') throw new Error('该工位已分配企业，请先终止对应租约释放工位')
  ws.status = status
  return { code: 0 }
}

/* ---------- 租约 ---------- */

/** 租约展示状态：terminated 为原始存储值；expiring/expired 由结束日期读取时派生 */
export type LeaseViewStatus = 'active' | 'expiring' | 'expired' | 'terminated'

/** 临期窗口：结束日期距今 15 天内视为即将到期 */
const EXPIRING_WINDOW_DAYS = 15

export function deriveLeaseStatus(lease: Lease): LeaseViewStatus {
  if (lease.status === 'terminated') return 'terminated'
  /* 长期租约无结束日期，不参与临期/到期派生 */
  if (lease.longTerm) return 'active'
  const today = formatToday()
  if (lease.endDate < today) return 'expired'
  return lease.endDate <= addDays(today, EXPIRING_WINDOW_DAYS) ? 'expiring' : 'active'
}

/* TODO: 替换为 GET /api/admin/workstation-leases — 全量租约（最新创建在前）；
 * expiring/expired 派生逻辑真实实现由服务端返回或定时任务回写 */
export async function fetchLeases(): Promise<Lease[]> {
  await delay(350)
  return [...leases].sort((a, b) => Number(b.id.replace('LS', '')) - Number(a.id.replace('LS', '')))
}

export interface LeasePayload {
  /** 租赁方 ID：enterprise=企业 ID / individual=用户 ID / custom=空串 */
  enterpriseId: string
  /** 租赁方名称 */
  enterpriseName: string
  renterType: LeaseRenterType
  workstationIds: string[]
  startDate: string
  endDate: string
  /** 长期租约：无结束日期 */
  longTerm: boolean
  monthlyRent: number
  /** 租赁周期（缺省按月租处理） */
  rentPeriod: RentPeriod
  contactName: string
  contactPhone: string
}

/* TODO: 替换为 GET /api/admin/renter-options — 租赁方选项（全部个人用户 + 全部企业，含联系方式用于自动填充） */
export async function fetchRenterOptions(): Promise<{
  users: { uid: string; nickname: string; phone: string }[]
  enterprises: { id: string; name: string; contactName: string; contactPhone: string }[]
}> {
  await delay(200)
  return {
    users: users.map((u) => ({ uid: u.uid, nickname: u.nickname, phone: u.phone })),
    enterprises: enterprises.map((e) => ({
      id: e.id,
      name: e.name,
      contactName: e.contactName,
      contactPhone: e.contactPhone,
    })),
  }
}

/* TODO: 替换为 POST /api/admin/workstation-leases — 创建租约并锁定所选工位（服务端事务） */
export async function createLease(payload: LeasePayload): Promise<Lease> {
  await delay(500)
  if (!payload.enterpriseName.trim()) throw new Error('请选择或输入租赁方')
  if (payload.renterType === 'enterprise' && !enterprises.some((e) => e.id === payload.enterpriseId))
    throw new Error('企业不存在')
  if (payload.renterType === 'individual' && !users.some((u) => u.uid === payload.enterpriseId))
    throw new Error('用户不存在')
  if (payload.workstationIds.length === 0) throw new Error('请至少选择一个工位')
  const targets = payload.workstationIds.map((id) => workstations.find((w) => w.id === id))
  if (targets.some((t) => !t)) throw new Error('存在无效工位')
  if (targets.some((t) => t !== undefined && t.status !== 'idle'))
    throw new Error('所选工位中存在已分配或维护中的工位')
  const maxNum = leases.reduce((m, l) => Math.max(m, Number(l.id.replace('LS', ''))), 0)
  const lease: Lease = {
    id: `LS${maxNum + 1}`,
    enterpriseId: payload.enterpriseId,
    enterpriseName: payload.enterpriseName.trim(),
    renterType: payload.renterType,
    workstationIds: payload.workstationIds,
    workstationLabels: targets.map((t) => t?.seatNo ?? ''),
    startDate: payload.startDate,
    endDate: payload.longTerm ? '' : payload.endDate,
    longTerm: payload.longTerm,
    status: 'active',
    monthlyRent: payload.monthlyRent,
    rentPeriod: payload.rentPeriod,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
  }
  leases.push(lease)
  for (const t of targets) {
    if (!t) continue
    t.status = 'assigned'
    t.enterpriseId = payload.enterpriseId || undefined
    t.enterpriseName = lease.enterpriseName
    t.leaseId = lease.id
  }
  return lease
}

export interface LeaseUpdatePayload {
  startDate: string
  endDate: string
  /** 长期租约：无结束日期 */
  longTerm: boolean
  monthlyRent: number
  /** 租赁周期（编辑可调整；缺省按月租处理） */
  rentPeriod: RentPeriod
  contactName: string
  contactPhone: string
}

/* TODO: 替换为 PUT /api/admin/workstation-leases/:id — 续期/改租金/改联系人；
 * 换工位不在编辑中支持：需终止原租约后重新创建（原型约定，M1 可扩展） */
export async function updateLease(id: string, payload: LeaseUpdatePayload): Promise<{ code: number }> {
  await delay(400)
  const lease = leases.find((l) => l.id === id)
  if (!lease) throw new Error('租约不存在')
  if (lease.status === 'terminated') throw new Error('已终止租约不可编辑')
  lease.startDate = payload.startDate
  lease.endDate = payload.longTerm ? '' : payload.endDate
  lease.longTerm = payload.longTerm
  lease.monthlyRent = payload.monthlyRent
  lease.rentPeriod = payload.rentPeriod
  lease.contactName = payload.contactName
  lease.contactPhone = payload.contactPhone
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/workstation-leases/:id/terminate — 终止租约并释放全部关联工位（服务端事务） */
export async function terminateLease(id: string): Promise<{ code: number }> {
  await delay(450)
  const lease = leases.find((l) => l.id === id)
  if (!lease) throw new Error('租约不存在')
  if (lease.status === 'terminated') throw new Error('租约已终止')
  lease.status = 'terminated'
  lease.terminatedAt = formatNow()
  for (const wid of lease.workstationIds) {
    const ws = workstations.find((w) => w.id === wid)
    if (ws && ws.leaseId === lease.id) {
      ws.status = 'idle'
      ws.enterpriseId = undefined
      ws.enterpriseName = undefined
      ws.leaseId = undefined
    }
  }
  return { code: 0 }
}
