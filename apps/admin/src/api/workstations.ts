import type { Lease, LeaseRenterType, RentPeriod, Workstation, WorkstationArea, WorkstationType } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut, httpUpload } from './http'

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

/** 租约打印版式（全局单例）：标题 + 「租赁信息」栏目可见性 + 「条款说明」纯文本 */
export interface LeasePrintLayout {
  title: string
  /** 栏目可见性：键集见 constants/leasePrintLayout.ts 的 LEASE_PRINT_FIELDS */
  fields: Record<string, boolean>
  /** 自定义条款说明（空串 = 打印单回落内置三条条款） */
  clausesText: string
}

/* GET /api/admin/leases/print-layout — 租约打印版式（无配置时服务端返回默认值） */
export async function fetchLeasePrintLayout(): Promise<LeasePrintLayout> {
  return httpGet<LeasePrintLayout>('/leases/print-layout')
}

/* PUT /api/admin/leases/print-layout — 更新打印版式（未传的字段保持原值） */
export async function updateLeasePrintLayout(payload: Partial<LeasePrintLayout>): Promise<LeasePrintLayout> {
  return httpPut<LeasePrintLayout>('/leases/print-layout', payload)
}

/** GET /api/admin/leases/:id/print — 租约打印单数据（标题 + 生成时间 + 租约 + 栏目可见性 + 条款） */
export async function fetchLeasePrint(id: string): Promise<{ title: string; generatedAt: string; lease: Lease; fields: Record<string, boolean>; clauses: string[] }> {
  return httpGet<{ title: string; generatedAt: string; lease: Lease; fields: Record<string, boolean>; clauses: string[] }>(`/leases/${id}/print`)
}

/* GET /api/admin/workstation-leases/:id — 租约详情（错误外抛，由页面区分 404 与其它失败） */
export async function fetchLease(id: string): Promise<Lease> {
  return httpGet<Lease>(`/workstation-leases/${id}`)
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
  users: { uid: string; nickname: string; realName: string; phone: string }[]
  enterprises: { id: string; name: string; contactName: string; contactPhone: string }[]
}> {
  return httpGet<{
    users: { uid: string; nickname: string; realName: string; phone: string }[]
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

/* ---------- 续期 ---------- */

export interface LeaseRenewPayload {
  /** 新到期日（YYYY-MM-DD，须晚于当前到期日） */
  endDate: string
  /** 月租金（元）：默认沿用，可随续期一并调整 */
  monthlyRent: number
  /** 续期说明（必填，服务端追加续期记录） */
  reason: string
}

/* POST /api/admin/workstation-leases/:id/renew — 续期：延长到期日并追加续期记录；
 * 已终止 / 已归档租约与长期租约（无到期日）不可续期 */
export async function renewLease(id: string, payload: LeaseRenewPayload): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/workstation-leases/${id}/renew`, payload)
}

/* ---------- 合同扫描件（线下纸质合同，复用素材库存储） ---------- */

export interface LeaseContract {
  id: string
  url: string
  fileName: string
  mime: string
  size: number
  sourceType?: string
  sourceId?: string
  createdAt: string
}

/* GET /api/admin/workstation-leases/:id/contracts — 该租约的合同附件（最新在前） */
export async function fetchLeaseContracts(id: string): Promise<LeaseContract[]> {
  return httpGet<LeaseContract[]>(`/workstation-leases/${id}/contracts`)
}

/* POST /api/admin/workstation-leases/:id/contracts — 上传合同扫描件（图片/PDF）；
 * 单文件大小上限取系统配置 uploadMaxSizeMb */
export async function uploadLeaseContract(id: string, file: File): Promise<LeaseContract> {
  const form = new FormData()
  form.append('file', file)
  return httpUpload<LeaseContract>(`/workstation-leases/${id}/contracts`, form)
}

/* DELETE /api/admin/workstation-leases/:id/contracts/:assetId — 删除合同扫描件（仅限该租约名下附件） */
export async function deleteLeaseContract(id: string, assetId: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/workstation-leases/${id}/contracts/${assetId}`)
}

/* POST /api/admin/workstation-leases/:id/archive — 归档已终止租约（可在归档管理中恢复） */
export async function archiveLease(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/workstation-leases/${id}/archive`)
}
