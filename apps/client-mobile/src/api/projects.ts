import { apiMode, httpGet } from './http'
import type { MyProject } from '@/types'
import * as mock from '@/mock/handlers/projects'

/** GET /api/app/me/projects — 我承接的项目（本人或企业承接；进度/里程碑只读） */
export async function fetchMyProjects(): Promise<MyProject[]> {
  if (apiMode === 'mock') return mock.fetchMyProjects()
  return httpGet<MyProject[]>('/me/projects')
}
