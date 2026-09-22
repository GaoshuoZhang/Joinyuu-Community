import { httpGet, httpPost } from './http'
import type { ApplicationCreatePayload, ApplicationFormSchema, ApplicationType, MyApplication, MyApplicationDetail } from '@/types'

/** GET /api/app/me/applications — 我提交的申请（含审核时间线） */
export async function fetchMyApplications(): Promise<MyApplication[]> {
  return httpGet<MyApplication[]>('/me/applications')
}

/** GET /api/app/me/applications/:id — 本人的申请详情。 */
export async function fetchMyApplication(id: string): Promise<MyApplicationDetail> {
  return httpGet<MyApplicationDetail>(`/me/applications/${id}`)
}

/** GET /api/app/application-form/:type — 下发运营配置的申请表单 schema。 */
export async function fetchApplicationFormSchema(type: ApplicationType): Promise<ApplicationFormSchema> {
  return httpGet<ApplicationFormSchema>(`/application-form/${type}`)
}

/** POST /api/app/applications — 提交申请（schema 驱动字段 + 附件；→ 管理端「申请审核」） */
export async function createApplication(payload: ApplicationCreatePayload): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/applications', payload)
}

/** 撤回审核中的申请。 */
export async function withdrawApplication(id: string): Promise<void> {
  await httpPost(`/me/applications/${id}/withdraw`)
}

/** 驳回/撤回后修改重提（可补充材料）。 */
export async function resubmitApplication(id: string, payload: ApplicationCreatePayload): Promise<void> {
  await httpPost(`/me/applications/${id}/resubmit`, payload)
}

/** 重提前回填申请原始载荷。 */
export async function fetchMyApplicationPayload(id: string): Promise<ApplicationCreatePayload> {
  return httpGet<ApplicationCreatePayload>(`/me/applications/${id}/payload`)
}
