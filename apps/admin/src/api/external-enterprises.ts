import type { ExternalEnterprise, PageResult } from '@/types'
import { httpDelete, httpGet, httpPost, httpPut } from './http'

export interface ExternalEnterpriseQuery {
  page: number
  pageSize: number
  keyword?: string
  industry?: string
  status?: string
  /** 排序字段：cooperationCount（累计合作，默认倒序=合作最多在前）| firstCooperationAt（首次合作） */
  sortBy?: 'cooperationCount' | 'firstCooperationAt'
  sortOrder?: 'ascend' | 'descend'
}

export interface ExternalEnterprisePayload {
  name: string
  industry: string
  size?: string
  foundedAt?: string
  description?: string
}

/* GET /api/admin/external-enterprises?page&pageSize&keyword&industry&status&sortBy&sortOrder */
export async function fetchExternalEnterprises(
  query: ExternalEnterpriseQuery,
): Promise<PageResult<ExternalEnterprise>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.industry) qs.set('industry', query.industry)
  if (query.status) qs.set('status', query.status)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<ExternalEnterprise>>(`/external-enterprises?${qs}`)
}

/* GET /api/admin/external-enterprises/:id — 合作企业详情（按 ID 查询，含关联成员） */
export async function fetchExternalEnterprise(id: string): Promise<ExternalEnterprise> {
  return httpGet<ExternalEnterprise>(`/external-enterprises/${id}`)
}

export interface ExternalEnterpriseStats {
  /** 该企业（合作企业身份）发布的需求量 */
  demandCount: number
  /** 其成员以个人身份承接的项目量 */
  projectCount: number
}

/* GET /api/admin/external-enterprises/:id/stats — 合作企业数据概览 */
export async function fetchExternalEnterpriseStats(id: string): Promise<ExternalEnterpriseStats> {
  return httpGet<ExternalEnterpriseStats>(`/external-enterprises/${id}/stats`)
}

/* 合作企业 CRUD：新增 / 编辑 / 停用 / 删除 + 关联成员增删 */
/* POST /api/admin/external-enterprises — 新增合作企业（合作数据默认 0） */
export async function createExternalEnterprise(payload: ExternalEnterprisePayload): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/external-enterprises', payload)
}

/* PUT /api/admin/external-enterprises/:id — 编辑合作企业基本信息（改名时成员身份同步迁移） */
export async function updateExternalEnterprise(
  id: string,
  payload: ExternalEnterprisePayload,
): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/external-enterprises/${id}`, payload)
}

/* POST /api/admin/external-enterprises/:id/disable — 停用合作企业 */
export async function disableExternalEnterprise(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/external-enterprises/${id}/disable`)
}

/* POST /api/admin/external-enterprises/:id/enable — 启用合作企业（停用态恢复为正常） */
export async function enableExternalEnterprise(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/external-enterprises/${id}/enable`)
}

/* DELETE /api/admin/external-enterprises/:id — 物理删除（存在成员时后端拒绝） */
export async function deleteExternalEnterprise(id: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/external-enterprises/${id}`)
}

/* POST /api/admin/external-enterprises/:id/members — 新增关联成员（type=external_enterprise 身份） */
export async function addExternalMember(id: string, payload: { userId: string; title?: string }): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/external-enterprises/${id}/members`, payload)
}

/* DELETE /api/admin/external-enterprises/:id/members/:userId — 删除关联成员身份 */
export async function removeExternalMember(id: string, userId: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/external-enterprises/${id}/members/${userId}`)
}