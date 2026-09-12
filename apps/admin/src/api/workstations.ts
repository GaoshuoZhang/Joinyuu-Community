import type { Lease, LeaseRenterType, RentPeriod, Workstation, WorkstationArea, WorkstationType } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

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

/* ---------- 办公位 ---------- */

/* GET /api/admin/workstations — 全量办公位（含平面图分组所需 area/type 字段） */
export async function fetchWorkstations(): Promise<Workstation[]> {
  return httpGet<Workstation[]>('/workstations')
}

/* ---------- 区域规划 ---------- */

/* GET /api/admin/workstation-areas — 办公位区域列表（区域规划） */
export async function fetchWorkstationAreas(): Promise<WorkstationArea[]> {
  return httpGet<WorkstationArea[]>('/workstation-areas')
}

export interface WorkstationAreaPayload {
  name: string
  type: WorkstationType
  description: string
}

/* POST /api/admin/workstation-areas — 新增区域（名称唯一；WA1001+ 前缀） */
export async function createWorkstationArea(payload: WorkstationAreaPayload): Promise<WorkstationArea> {
  return httpPost<WorkstationArea>('/workstation-areas', payload)
}

/* PUT /api/admin/workstation-areas/:id — 编辑区域（外键化后无需级联刷新办公位冗余字段） */
export async function updateWorkstationArea(id: string, payload: WorkstationAreaPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/workstation-areas/${id}`, payload)
}

/* DELETE /api/admin/workstation-areas/:id — 删除区域（仅允许删除区域下无办公位时） */
export async function deleteWorkstationArea(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/workstation-areas/${id}`)
}

/* ---------- 办公位新增 / 资料编辑 ---------- */

export interface WorkstationPayload {
  area: string
  seatNo: string
  type: WorkstationType
  capacity: number
  note?: string
  /** 默认月租（元）：新增租约选"月租"时自动累加；非必填 */
  defaultMonthlyRent?: number
  /** 面积（㎡）：仅独立办公室；非必填 */
  areaSqm?: number
}

/* POST /api/admin/workstations — 新增办公位（编号全岛唯一，新增即空闲） */
export async function createWorkstation(payload: WorkstationPayload): Promise<Workstation> {
  return httpPost<Workstation>('/workstations', payload)
}

/* PUT /api/admin/workstations/:id — 编辑办公位资料（区域/编号/类型/容纳人数/备注）；
 * 分配关系与维护状态不在资料编辑中变更（分配走租约、维护走编辑弹窗内的维护开关） */
export async function updateWorkstation(id: string, payload: WorkstationPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/workstations/${id}`, payload)
}

/* DELETE /api/admin/workstations/:id — 删除办公位（已分配办公位不可删除，需先终止租约） */
export async function deleteWorkstation(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/workstations/${id}`)
}

/* POST /api/admin/workstations/:id/status — 维修登记/恢复，入参 { status: idle | maintenance }；
 * 已分配办公位不可直接标记维修，需先终止对应租约释放办公位 */
export async function setWorkstationStatus(
  id: string,
  status: 'idle' | 'maintenance',
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/workstations/${id}/status`, { status })
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

/* GET /api/admin/workstation-leases — 全量租约（最新新增在前）；
 * expiring/expired 派生逻辑真实实现由服务端返回或定时任务回写 */
export async function fetchLeases(): Promise<Lease[]> {
  return httpGet<Lease[]>('/workstation-leases')
}

/* 租约详情：后端无 by-id 端点，列表查找（租约量级小，与打印页同口径） */
export async function fetchLease(id: string): Promise<Lease | null> {
  try {
    return await httpGet<Lease>(`/workstation-leases/${id}`)
  } catch {
    return null
  }
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
  /** 备注（非必填） */
  note?: string
}

/* GET /api/admin/renter-options — 租赁方选项（全部个人用户 + 全部企业，含联系电话用于自动填充） */
export async function fetchRenterOptions(): Promise<{
  users: { uid: string; nickname: string; phone: string }[]
  enterprises: { id: string; name: string; contactName: string; contactPhone: string }[]
}> {
  return httpGet<{
    users: { uid: string; nickname: string; phone: string }[]
    enterprises: { id: string; name: string; contactName: string; contactPhone: string }[]
  }>('/renter-options')
}

/* POST /api/admin/workstation-leases — 新增租约并锁定所选办公位（服务端事务） */
export async function createLease(payload: LeasePayload): Promise<Lease> {
  return httpPost<Lease>('/workstation-leases', payload)
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
  /** 备注（非必填） */
  note?: string
  /** 编辑原因（必填，服务端追加编辑记录） */
  reason: string
}

/* PUT /api/admin/workstation-leases/:id — 续期/改租金/改联系人；
 * 换办公位不在编辑中支持：需终止原租约后重新新增（当前约定，后续可扩展） */
export async function updateLease(id: string, payload: LeaseUpdatePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/workstation-leases/${id}`, payload)
}

/* POST /api/admin/workstation-leases/:id/terminate — 终止租约并释放全部关联办公位（服务端事务） */
export async function terminateLease(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/workstation-leases/${id}/terminate`)
}

/* POST /api/admin/workstation-leases/:id/archive — 归档已终止租约（可在归档管理中恢复） */
export async function archiveLease(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/workstation-leases/${id}/archive`)
}
