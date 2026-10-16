import type { Enterprise, PageResult, User } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

export interface EnterpriseQuery {
  page: number
  pageSize: number
  keyword?: string
  industry?: string
  /** 状态筛选：支持单值（旧调用）与多值（勾选式筛选）。
   *  多选值中的空串占位表示「不按状态过滤」（保证该字段在 URL 中可往返），落库请求会被服务端忽略 */
  status?: string | string[]
}

export interface EnterprisePayload {
  name: string
  industry: string
  size: string
  leaseType: string
  /** 关联用户 UID（必填；联系人姓名/联系电话/邮箱由服务端按该用户解析） */
  contactUserId: string
  /** 联系人职位（展示于成员管理） */
  contactTitle?: string
  contactName?: string
  contactPhone?: string
  foundedAt?: string
  settledAt?: string
  contactEmail?: string
  description?: string
  tags?: string[]
}

/* GET /api/admin/enterprises?page&pageSize&keyword&industry&status */
export async function fetchEnterprises(query: EnterpriseQuery): Promise<PageResult<Enterprise>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.industry) qs.set('industry', query.industry)
  if (Array.isArray(query.status)) query.status.forEach((s) => qs.append('status', s))
  else if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<Enterprise>>(`/enterprises?${qs}`)
}

/* GET /api/admin/enterprises/options — 企业下拉选项（办公位租约等场景使用） */
export async function fetchEnterpriseOptions(): Promise<{ label: string; value: string }[]> {
  return httpGet<{ label: string; value: string }[]>('/enterprises/options')
}

/* GET /api/admin/enterprises/:id
 * 返回企业详情 + 成员列表（成员 = 持有该企业 community_enterprise 身份的用户）
 */
export async function fetchEnterprise(id: string): Promise<{ enterprise: Enterprise; members: User[] }> {
  return httpGet<{ enterprise: Enterprise; members: User[] }>(`/enterprises/${id}`)
}

export interface EnterpriseStats {
  /** 该企业（社区企业身份）发布的需求量 */
  demandCount: number
  /** 该企业承接/参与的项目量 */
  projectCount: number
}

/* GET /api/admin/enterprises/:id/stats — 企业数据概览 */
export async function fetchEnterpriseStats(id: string): Promise<EnterpriseStats> {
  return httpGet<EnterpriseStats>(`/enterprises/${id}/stats`)
}

/* 社区企业 CRUD：新增 / 编辑 / 停用 / 删除 */
/* POST /api/admin/enterprises — 管理员手动新增企业（新增即正常态） */
export async function createEnterprise(payload: EnterprisePayload): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/enterprises', payload)
}

/* PUT /api/admin/enterprises/:id — 编辑企业基本信息 */
export async function updateEnterprise(id: string, payload: EnterprisePayload): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/enterprises/${id}`, payload)
}

/* POST /api/admin/enterprises/:id/disable — 停用企业（停用后不可新增新租约） */
export async function disableEnterprise(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/enterprises/${id}/disable`)
}

/* POST /api/admin/enterprises/:id/enable — 启用企业（停用态恢复为正常） */
export async function enableEnterprise(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/enterprises/${id}/enable`)
}

/* DELETE /api/admin/enterprises/:id — 物理删除（存在成员/租约/需求/项目引用时后端拒绝） */
export async function deleteEnterprise(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/enterprises/${id}`)
}
