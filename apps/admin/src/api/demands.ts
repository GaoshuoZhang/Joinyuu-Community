import type { Demand, PageResult, Project, ProjectInitPayload } from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

export interface DemandQuery {
  page: number
  pageSize: number
  keyword?: string
  category?: string
  demandType?: string
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
  /** 按提交人筛选（用户详情数据概览跳转） */
  publisherId?: string
  /** 按发布企业筛选（企业详情数据概览跳转；值为社区企业 ID 或合作企业 ID） */
  enterprise?: string
  /** 排序字段：createdAt（默认，倒序=最新在前）| publishedAt（发布时间） */
  sortBy?: 'createdAt' | 'id' | 'publishedAt'
  sortOrder?: 'ascend' | 'descend'
}

/* GET /api/admin/demands?page&pageSize&keyword&category&status&publisherId&enterprise&sortBy&sortOrder */
export async function fetchDemands(query: DemandQuery): Promise<PageResult<Demand>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.category) qs.set('category', query.category)
  if (query.demandType) qs.set('demandType', query.demandType)
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  if (query.publisherId) qs.set('publisherId', query.publisherId)
  if (query.enterprise) qs.set('enterprise', query.enterprise)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<Demand>>(`/demands?${qs}`)
}

/* GET /api/admin/demands/:id */
export async function fetchDemand(id: string): Promise<Demand> {
  return httpGet<Demand>(`/demands/${id}`)
}

export interface DemandPublishPayload {
  chargeAmountFen?: number
  chargeRefundPolicy?: string
  title: string
  category: string
  demandType?: 'task' | 'investment' | 'cooperation'
  deliverable?: string
  deliverBy?: string
  cooperationNeed?: string
  returnOffer?: string
  bottleneck?: string
  partnershipMode?: string
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
  /** 公开联系人：开启后客户端（含未登录游客）可见联系人姓名/电话/邮箱；默认关闭 */
  contactPublic: boolean
  /** 响应需求奖励积分（历史缺省值按积分规则发放） */
  respondPoints?: number
  /** 响应是否需管理员审核（默认开启） */
  respondNeedReview?: boolean
}

/* POST /api/admin/demands/:id/proxy-respond — 管理员代成员响应需求（记录 operator 信息） */
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

/* POST /api/admin/demands/:id/respondents/:respondentId/review，入参 { status, reason?, hiddenFields? }
 * 通过 = 该响应回到待处理（发布者之后可选定承接方），hiddenFields 为「不向需求方显示」的字段；
 * 驳回 = 状态改为已驳回并记录理由 */
export async function reviewDemandRespondent(
  id: string,
  respondentId: number,
  payload: { status: 'approved' | 'rejected'; reason?: string; hiddenFields?: string[] },
): Promise<{ code: number }> {
  if (payload.status === 'approved') {
    return httpPost<{ code: number }>(`/demands/${id}/respondents/${respondentId}/review`, {
      status: 'approved',
      hiddenFields: payload.hiddenFields ?? [],
    })
  }
  return httpPost<{ code: number }>(`/demands/${id}/respondents/${respondentId}/review`, {
    status: 'rejected',
    reason: payload.reason?.trim() ?? '',
  })
}

/* PUT /api/admin/demands/:id/respondents/:respondentId，入参为响应内容字段（响应方基本信息不可改）
 * 仅待审核响应可编辑（通过/驳回后返回 409）；手机号与邮箱传空串表示清空 */
export interface UpdateRespondentPayload {
  message: string
  quote?: string
  timeline?: string
  cases?: string
  phone?: string
  email?: string
}

export async function updateDemandRespondent(
  id: string,
  respondentId: number,
  payload: UpdateRespondentPayload,
): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/demands/${id}/respondents/${respondentId}`, payload)
}

/** 响应审核列表项（「业务运营 → 响应审核」）：待审核响应 + 所属需求摘要 */
export interface PendingRespondent {
  id: number
  demandId: string
  demandTitle: string
  demandStatus: string
  publisherName: string
  /** 响应者用户 ID / 真实姓名 / 昵称（来自账号；代报名等无账号的响应不落这些字段） */
  userId?: string
  realName?: string
  nickname?: string
  name: string
  enterprise: string
  responderIdentity?: { type?: string; title?: string | null; enterpriseName?: string } | null
  quote?: string
  timeline?: string
  cases?: string
  message: string
  phone?: string
  email?: string
  at: string
  status: string
  /** 对需求方隐藏的响应字段（通过时勾选；后台始终可见真实值） */
  hiddenFields?: string[]
}

/* GET /api/admin/demand-responses?page&pageSize&keyword&demandId — 待审核响应（pending_review 且未撤回，提交时间倒序） */
export async function fetchDemandResponses(
  query: { page: number; pageSize: number; keyword?: string; demandId?: string },
): Promise<PageResult<PendingRespondent>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.demandId) qs.set('demandId', query.demandId)
  return httpGet<PageResult<PendingRespondent>>(`/demand-responses?${qs}`)
}

/* POST /api/admin/demands/:id/approve — 待审核需求仅读审核通过，转为待发布 */
export async function approveDemand(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/approve`)
}

/* POST /api/admin/demands/:id/publish-now — 待发布需求立即发布 */
export async function publishDemandNow(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/publish-now`)
}

/* POST /api/admin/demands/:id/retract — 撤回发布：已发布 → 待发布 */
export async function retractDemand(id: string, takedownReason?: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/retract`, { takedownReason })
}

/* POST /api/admin/demands/:id/schedule — 待发布需求设定定时发布时间，转为定时发布中 */
export async function scheduleDemand(id: string, scheduledAt: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/schedule`, { scheduledAt })
}

/* POST /api/admin/demands/:id/cancel-schedule — 取消定时发布，转为待发布 */
export async function cancelDemandSchedule(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/cancel-schedule`)
}

/* PUT /api/admin/demands/:id — 需求再编辑（待发布/已发布，不改状态） */
export async function updateDemand(id: string, payload: DemandPublishPayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/demands/${id}`, payload)
}

/* POST /api/admin/demands/:id/reject，入参 { reason }（必填） */
export async function rejectDemand(id: string, reason: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/reject`, { reason })
}

/* PATCH /api/admin/demands/:id/status，入参 { status: 'closed' } */
export async function closeDemand(id: string): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/demands/${id}/status`, { status: 'closed' })
}

/* POST /api/admin/demands/:id/archive — 归档已驳回需求（可在归档管理中恢复） */
export async function archiveDemand(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/demands/${id}/archive`)
}

/* ---------- 立项 ---------- */

export interface UndertakerOption {
  group: string
  label: string
  value: string
}

/* GET /api/admin/demands/undertaker-options — 立项承接方候选（社区企业 + 社区个体） */
export async function fetchUndertakerOptions(): Promise<UndertakerOption[]> {
  return httpGet<UndertakerOption[]>('/demands/undertaker-options')
}

/* GET /api/admin/demands/:id/selected-respondents — 转为承接方选项，用于「需求立项」表单自动填充；
 * 缺省取需求方已选定的承接方（可多个）；传入 respondentIds 时取「立项前置选定承接方」勾选的响应，
 * 需求无对应响应时返回空数组 */
export async function fetchDemandSelectedRespondents(id: string, respondentIds?: number[]): Promise<UndertakerOption[]> {
  const qs = respondentIds?.length ? `?respondentIds=${respondentIds.join(',')}` : ''
  return httpGet<UndertakerOption[]>(`/demands/${id}/selected-respondents${qs}`)
}

/* POST /api/admin/demands/:id/initiate-project — 需求立项（可多承接方）
 * 服务端新增项目 + 需求↔项目双向关联（demand.projectId ↔ project.sourceDemandId） */
export async function initiateProject(demandId: string, payload: ProjectInitPayload): Promise<Project> {
  return httpPost<Project>(`/demands/${demandId}/initiate-project`, payload)
}

/* ---------- 后台直接新增需求 ---------- */

/* GET /api/admin/publisher-options — 提交人选项（全部个人用户 + 全部企业，含联系电话用于自动填充） */
export async function fetchPublisherOptions(): Promise<{
  users: { uid: string; nickname: string; realName: string; phone: string; email: string; tag: '社区个体' | '个人用户' }[]
  enterprises: { id: string; name: string; contactName: string; contactPhone: string; contactEmail?: string; tag: '社区企业' | '合作企业' }[]
}> {
  return httpGet<{
    users: { uid: string; nickname: string; realName: string; phone: string; email: string; tag: '社区个体' | '个人用户' }[]
    enterprises: { id: string; name: string; contactName: string; contactPhone: string; contactEmail?: string; tag: '社区企业' | '合作企业' }[]
  }>('/publisher-options')
}

export interface DemandCreatePayload extends DemandPublishPayload {
  scheduledAt?: string
}

/* POST /api/admin/demands — 后台直接新增需求
 * 提交人（账号名/姓名/角色名）由服务端取当前登录工作人员，不由表单提交；
 * 设置 scheduledAt 时进入定时发布中状态，到点自动发布；否则立即发布 */
export async function createDemand(payload: DemandCreatePayload): Promise<Demand> {
  return httpPost<Demand>('/demands', payload)
}
