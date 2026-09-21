import { apiMode, httpGet, httpPost } from './http'
import type { ApplicationCreatePayload, ApplicationFormSchema, ApplicationType, MyApplication, MyApplicationDetail } from '@/types'

/** GET /api/app/me/applications — 我提交的申请（含审核时间线） */
export async function fetchMyApplications(): Promise<MyApplication[]> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).fetchMyApplications()
  return httpGet<MyApplication[]>('/me/applications')
}

/** GET /api/app/me/applications/:id — 本人的申请详情。 */
export async function fetchMyApplication(id: string): Promise<MyApplicationDetail> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).fetchMyApplication(id)
  return httpGet<MyApplicationDetail>(`/me/applications/${id}`)
}

/** GET /api/app/application-form/:type — 下发运营配置的申请表单 schema。 */
export async function fetchApplicationFormSchema(type: ApplicationType): Promise<ApplicationFormSchema> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).fetchFormSchema(type)
  return httpGet<ApplicationFormSchema>(`/application-form/${type}`)
}

/** POST /api/app/applications — 提交申请（schema 驱动字段 + 附件；→ 管理端「申请审核」） */
export async function createApplication(payload: ApplicationCreatePayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).createApplication(payload)
  return httpPost<{ id: string }>('/applications', payload)
}

/** 撤回审核中的申请。 */
export async function withdrawApplication(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).withdrawApplication(id)
  await httpPost(`/me/applications/${id}/withdraw`)
}

/** 驳回/撤回后修改重提（可补充材料）。 */
export async function resubmitApplication(id: string, payload: ApplicationCreatePayload): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).resubmitApplication(id, payload)
  await httpPost(`/me/applications/${id}/resubmit`, payload)
}

/** 重提前回填申请原始载荷。 */
export async function fetchMyApplicationPayload(id: string): Promise<ApplicationCreatePayload> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/applications')).fetchMyApplicationPayload(id)
  return httpGet<ApplicationCreatePayload>(`/me/applications/${id}/payload`)
}
