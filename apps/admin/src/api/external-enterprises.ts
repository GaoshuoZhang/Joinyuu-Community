import type { ExternalEnterprise, PageResult } from '@/types'
import { httpGet } from './http'

export interface ExternalEnterpriseQuery {
  page: number
  pageSize: number
  keyword?: string
  industry?: string
  /** 排序字段：cooperationCount（累计合作，默认倒序=合作最多在前）| firstCooperationAt（首次合作） */
  sortBy?: 'cooperationCount' | 'firstCooperationAt'
  sortOrder?: 'ascend' | 'descend'
}

/* 已接入 M1 真实接口：GET /api/admin/external-enterprises?page&pageSize&keyword&industry&sortBy&sortOrder */
export async function fetchExternalEnterprises(
  query: ExternalEnterpriseQuery,
): Promise<PageResult<ExternalEnterprise>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.industry) qs.set('industry', query.industry)
  if (query.sortBy) qs.set('sortBy', query.sortBy)
  if (query.sortOrder) qs.set('sortOrder', query.sortOrder)
  return httpGet<PageResult<ExternalEnterprise>>(`/external-enterprises?${qs}`)
}

/* 已接入 M1 真实接口：GET /api/admin/external-enterprises/:id — 外部企业详情（按 ID 查询，含关联成员） */
export async function fetchExternalEnterprise(id: string): Promise<ExternalEnterprise> {
  return httpGet<ExternalEnterprise>(`/external-enterprises/${id}`)
}

export interface ExternalEnterpriseStats {
  /** 该企业（外部企业身份）发布的需求量 */
  demandCount: number
  /** 其成员以个人身份承接的项目量 */
  projectCount: number
}

/* 已接入 M1 真实接口：GET /api/admin/external-enterprises/:id/stats — 外部企业数据概览 */
export async function fetchExternalEnterpriseStats(id: string): Promise<ExternalEnterpriseStats> {
  return httpGet<ExternalEnterpriseStats>(`/external-enterprises/${id}/stats`)
}
