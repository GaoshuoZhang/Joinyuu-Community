import type { Application, PageResult } from '@/types'
import { httpGet, httpPost } from './http'

export interface ApplicationQuery {
  page: number
  pageSize: number
  type?: string
  status?: string
}

/* GET /api/admin/applications?page&pageSize&type&status
 * 口径：返回企业入驻/个体入驻/企业合作/身份绑定/企业退驻五类审核；空间预约随公共空间模块。 */
export async function fetchApplications(query: ApplicationQuery): Promise<PageResult<Application>> {
  const qs = new URLSearchParams()
  qs.set('page', String(query.page))
  qs.set('pageSize', String(query.pageSize))
  if (query.type) qs.set('type', query.type)
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<Application>>(`/applications?${qs}`)
}

/* POST /api/admin/applications/:id/approve，入参 { comment } */
export async function approveApplication(id: string, comment: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/applications/${id}/approve`, { comment })
}

/* POST /api/admin/applications/:id/reject，入参 { comment } */
export async function rejectApplication(id: string, comment: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/applications/${id}/reject`, { comment })
}

/* POST /api/admin/applications/:id/archive */
export async function archiveApplication(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/applications/${id}/archive`, {})
}

/* 审核单打印数据：GET /api/admin/applications/:id/print */
export interface ApplicationPrintResult {
  title: string
  generatedAt: string
  application: Application
}

export async function fetchApplicationPrint(id: string): Promise<ApplicationPrintResult> {
  return httpGet<ApplicationPrintResult>(`/applications/${id}/print`)
}

export type ApplicationFormType = 'settle' | 'cooperation' | 'individual' | 'identity'
export type ApplicationFieldType = 'text' | 'textarea' | 'select' | 'number' | 'date' | 'upload'

export interface ApplicationFieldOption {
  label: string
  value: string
  [property: string]: unknown
}

export interface ApplicationFormField {
  key: string
  label: string
  type: ApplicationFieldType
  required?: boolean
  placeholder?: string
  help?: string
  maxlength?: number
  options?: ApplicationFieldOption[]
  accept?: string
  multiple?: boolean
  maxCount?: number
  [property: string]: unknown
}

export interface ApplicationFormConfig {
  type: ApplicationFormType
  title: string
  subtitle: string
  submitLabel: string
  tips?: string[]
  fields: ApplicationFormField[]
  updatedAt?: string
}

export async function fetchApplicationFormConfigs(): Promise<ApplicationFormConfig[]> {
  return httpGet<ApplicationFormConfig[]>('/applications/form-configs/all')
}

export async function saveApplicationFormConfig(
  type: string,
  config: Omit<ApplicationFormConfig, 'type' | 'updatedAt'>,
): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/applications/form-configs/${type}`, config)
}
