import { apiMode, httpGet, httpPost } from './http'
import type { ApplicationCreatePayload, ApplicationFormSchema, ApplicationType, MyApplication } from '@/types'
import * as mock from '@/mock/handlers/applications'

/** GET /api/app/me/applications — 我提交的申请（含审核时间线） */
export async function fetchMyApplications(): Promise<MyApplication[]> {
  if (apiMode === 'mock') return mock.fetchMyApplications()
  return httpGet<MyApplication[]>('/me/applications')
}

/** GET /api/app/application-form/:type — 申请表单 schema（自定义字段下发；缺口 §7.1-14） */
export async function fetchApplicationFormSchema(type: ApplicationType): Promise<ApplicationFormSchema> {
  if (apiMode === 'mock') return mock.fetchFormSchema(type)
  return httpGet<ApplicationFormSchema>(`/application-form/${type}`)
}

/** POST /api/app/applications — 提交申请（schema 驱动字段 + 附件；→ 管理端「申请审核」） */
export async function createApplication(payload: ApplicationCreatePayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.createApplication(payload)
  return httpPost<{ id: string }>('/applications', payload)
}

/** [MOCK-ONLY] 撤回审核中的申请。 */
export async function withdrawApplication(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.withdrawApplication(id)
  await httpPost(`/me/applications/${id}/withdraw`)
}

/** [MOCK-ONLY] 驳回/撤回后修改重提（可补充材料）。 */
export async function resubmitApplication(id: string, payload: ApplicationCreatePayload): Promise<void> {
  if (apiMode === 'mock') return mock.resubmitApplication(id, payload)
  await httpPost(`/me/applications/${id}/resubmit`, payload)
}

/** [MOCK-ONLY] 重提前回填申请原始载荷。 */
export async function fetchMyApplicationPayload(id: string): Promise<ApplicationCreatePayload> {
  if (apiMode === 'mock') return mock.fetchMyApplicationPayload(id)
  return httpGet<ApplicationCreatePayload>(`/me/applications/${id}/payload`)
}
