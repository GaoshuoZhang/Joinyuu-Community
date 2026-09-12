import { apiMode, httpGet, httpPost } from './http'
import type { ApplicationCreatePayload, MyApplication } from '@/types'
import * as mock from '@/mock/handlers/applications'

/** GET /api/app/me/applications — 我提交的申请（含审核时间线） */
export async function fetchMyApplications(): Promise<MyApplication[]> {
  if (apiMode === 'mock') return mock.fetchMyApplications()
  return httpGet<MyApplication[]>('/me/applications')
}

/** POST /api/app/applications — 提交申请（settle/individual/cooperation/identity → 管理端「申请审核」） */
export async function createApplication(payload: ApplicationCreatePayload): Promise<{ id: string }> {
  if (apiMode === 'mock') return mock.createApplication(payload)
  return httpPost<{ id: string }>('/applications', payload)
}
