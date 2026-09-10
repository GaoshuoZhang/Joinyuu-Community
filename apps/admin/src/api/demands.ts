import type { Demand, PageResult, Project, ProjectInitPayload, UserIdentity } from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

export interface DemandQuery {
  page: number
  pageSize: number
  keyword?: string
  category?: string
  status?: string
  /** 按提交人筛选（用户详情数据概览跳转） */
  publisherId?: string
  /** 按发布企业筛选（企业详情数据概览跳转；值为社区企业 ID 或外部企业 ID） */
  enterprise?: string
  /** 排序字段：createdAt（默认，倒序=最新在前）| publishedAt（发布时间） */
  sortBy?: 'createdAt' | 'id' | 'publishedAt'
  sortOrder?: 'ascend' | 'descend'
}

/* 已接入 M1 真实接口：GET /api/admin/demands?page&pageSize&keyword&category&status&publisherId&enterprise&sortBy&sortOrder */
export async function fetchDemands(query: DemandQuery): Promise<PageResult<Demand>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.category) qs.set('category', query.category)
  if (query.status) qs.set('status', query.status)
  if (query.publisherId) qs.set('publisherId', query.publisherId)
  if (query.enterprise) qs.set('enterprise', query.enterprise)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<Demand>>(`/demands?${qs}`)
}

/* 已接入 M1 真实接口：GET /api/admin/demands/:id */
export async function fetchDemand(id: string): Promise<Demand> {
  return httpGet<Demand>(`/demands/${id}`)
}

export interface DemandPublishPayload {
  /** 表单内部字段：需求方选择器值（U:uid / E:id / 自定义名称），仅前端表单使用，不随 payload 提交 */
  publisherValue?: string
  title: string
  category: string
  budget: string
  period: string
  description: string
  visibilityIdentities: string[]
  visibilityLevels: string[]
  /** 可报名范围：默认与可见范围一致，可单独调整 */
  enrollmentIdentities: string[]
  enrollmentLevels: string[]
  deadline: string
  /** 联系人姓名（企业提交=企业联系人 / 个人提交=真实姓名 / 自定义手填，必填） */
  contactName: string
  /** 提交人联系电话（必填） */
  contactPhone: string
  /** 提交人联系邮箱（选填） */
  contactEmail?: string
  /** 自定义响应需求奖励积分（缺省 = 按积分规则发放） */
  respondPoints?: number
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/proxy-respond — 管理员代成员响应需求（记录 operator 信息） */
export async function proxyRespondDemand(
  id: string,
  payload: {
    userName: string
    enterprise: string
    phone: string
    email?: string
    quote?: string
    message: string
  },
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/proxy-respond`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/approve — 待审核需求仅读审核通过，转为待发布 */
export async function approveDemand(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/approve`)
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/publish-now — 待发布需求立即发布 */
export async function publishDemandNow(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/publish-now`)
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/retract — 撤回发布：已发布 → 待发布 */
export async function retractDemand(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/retract`)
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/schedule — 待发布需求设定定时发布时间，转为定时发布中 */
export async function scheduleDemand(id: string, scheduledAt: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/schedule`, { scheduledAt })
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/cancel-schedule — 取消定时发布，转为待发布 */
export async function cancelDemandSchedule(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/cancel-schedule`)
}

/* 已接入 M1 真实接口：PUT /api/admin/demands/:id — 需求再编辑（待发布/已发布，不改状态） */
export async function updateDemand(id: string, payload: DemandPublishPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/demands/${id}`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/reject，入参 { reason }（必填） */
export async function rejectDemand(id: string, reason: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/reject`, { reason })
}

/* 已接入 M1 真实接口：PATCH /api/admin/demands/:id/status，入参 { status: 'closed' } */
export async function closeDemand(id: string): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/demands/${id}/status`, { status: 'closed' })
}

/* ---------- 立项 ---------- */

export interface UndertakerOption {
  group: string
  label: string
  value: string
}

/* 已接入 M1 真实接口：GET /api/admin/demands/undertaker-options — 立项承接方候选（社区企业 + 社区个体） */
export async function fetchUndertakerOptions(): Promise<UndertakerOption[]> {
  return httpGet<UndertakerOption[]>('/demands/undertaker-options')
}

/* 已接入 M1 真实接口：POST /api/admin/demands/:id/initiate-project — 需求立项（可多承接方）
 * 服务端创建项目 + 需求↔项目双向关联（demand.projectId ↔ project.sourceDemandId） */
export async function initiateProject(demandId: string, payload: ProjectInitPayload): Promise<Project> {
  return httpPost<Project>(`/demands/${demandId}/initiate-project`, payload)
}

/* ---------- 后台直接创建需求 ---------- */

/* 已接入 M1 真实接口：GET /api/admin/publisher-options — 提交人选项（全部个人用户 + 全部企业，含联系方式用于自动填充） */
export async function fetchPublisherOptions(): Promise<{
  users: { uid: string; nickname: string; realName: string; phone: string; email: string; tag: '社区个体' | '个人用户' }[]
  enterprises: { id: string; name: string; contactName: string; contactPhone: string; contactEmail?: string; tag: '社区企业' | '外部企业' }[]
}> {
  return httpGet<{
    users: { uid: string; nickname: string; realName: string; phone: string; email: string; tag: '社区个体' | '个人用户' }[]
    enterprises: { id: string; name: string; contactName: string; contactPhone: string; contactEmail?: string; tag: '社区企业' | '外部企业' }[]
  }>('/publisher-options')
}

export interface DemandCreatePayload extends DemandPublishPayload {
  /** 提交人 ID：individual=用户 ID / enterprise=企业 ID / custom=空串 */
  publisherId: string
  /** 自定义提交人名称（publisherType=custom 时使用） */
  publisherName?: string
  /** 提交人类型（决定联系方式自动填充与身份快照来源） */
  publisherType: 'individual' | 'enterprise' | 'custom'
  /** 提交身份快照（仅 individual 时存在） */
  publisherIdentity: UserIdentity | null
  /** 提交人联系电话（必填） */
  contactPhone: string
  /** 提交人联系邮箱（选填） */
  contactEmail?: string
  scheduledAt?: string
}

/* 已接入 M1 真实接口：POST /api/admin/demands — 后台直接创建需求（选定提交用户与其提交身份）
 * 设置 scheduledAt 时进入定时发布中状态，到点自动发布；否则立即发布
 * publisherValue 为前端表单内部字段（需求方选择器），不随 payload 提交 */
export async function createDemand(payload: DemandCreatePayload): Promise<Demand> {
  const { publisherValue: _publisherValue, ...body } = payload
  void _publisherValue
  return httpPost<Demand>('/demands', body)
}
