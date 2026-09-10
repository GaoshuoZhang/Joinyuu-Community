import type { Application, PageResult } from '@/types'
import { httpGet, httpPost } from './http'

export interface ApplicationQuery {
  page: number
  pageSize: number
  type?: string
  status?: string
}

/* 已接入 M1 真实接口：GET /api/admin/applications?page&pageSize&type&status
 * 口径：仅返回入驻申请与身份绑定；空间预约申请随公共空间模块、
 * 展示页发布申请随资讯内容模块迁移至各自审批入口 */
export async function fetchApplications(query: ApplicationQuery): Promise<PageResult<Application>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.type) qs.set('type', query.type)
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<Application>>(`/applications?${qs}`)
}

/* 已接入 M1 真实接口：POST /api/admin/applications/:id/approve，入参 { comment } */
export async function approveApplication(id: string, comment: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/applications/${id}/approve`, { comment })
}

/* 已接入 M1 真实接口：POST /api/admin/applications/:id/reject，入参 { comment } */
export async function rejectApplication(id: string, comment: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/applications/${id}/reject`, { comment })
}
