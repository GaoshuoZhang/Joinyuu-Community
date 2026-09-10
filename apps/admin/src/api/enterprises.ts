import type { Enterprise, PageResult, User } from '@/types'
import { httpGet, httpPatch } from './http'

export interface EnterpriseQuery {
  page: number
  pageSize: number
  keyword?: string
  industry?: string
  status?: string
}

/* 已接入 M1 真实接口：GET /api/admin/enterprises?page&pageSize&keyword&industry&status */
export async function fetchEnterprises(query: EnterpriseQuery): Promise<PageResult<Enterprise>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.keyword) qs.set('keyword', query.keyword)
  if (query.industry) qs.set('industry', query.industry)
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<Enterprise>>(`/enterprises?${qs}`)
}

/* 已接入 M1 真实接口：GET /api/admin/enterprises/options — 企业下拉选项（办公位租约等场景使用） */
export async function fetchEnterpriseOptions(): Promise<{ label: string; value: string }[]> {
  return httpGet<{ label: string; value: string }[]>('/enterprises/options')
}

/* 已接入 M1 真实接口：GET /api/admin/enterprises/:id
 * 返回企业详情 + 成员列表（成员 = 持有该企业 community_enterprise 身份的用户）
 */
export async function fetchEnterprise(id: string): Promise<{ enterprise: Enterprise; members: User[] }> {
  return httpGet<{ enterprise: Enterprise; members: User[] }>(`/enterprises/${id}`)
}

/* 已接入 M1 真实接口：PATCH /api/admin/enterprises/:id/showcase-status，入参 { status, comment }
 * 展示页审核：published / rejected / pending
 */
export async function reviewShowcase(
  id: string,
  status: Enterprise['showcaseStatus'],
  comment?: string,
): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/enterprises/${id}/showcase-status`, { status, comment })
}

export interface EnterpriseStats {
  /** 该企业（社区企业身份）发布的需求量 */
  demandCount: number
  /** 该企业承接/参与的项目量 */
  projectCount: number
}

/* 已接入 M1 真实接口：GET /api/admin/enterprises/:id/stats — 企业数据概览 */
export async function fetchEnterpriseStats(id: string): Promise<EnterpriseStats> {
  return httpGet<EnterpriseStats>(`/enterprises/${id}/stats`)
}
