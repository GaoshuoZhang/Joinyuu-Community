import { apiMode, httpGet, httpPost } from './http'
import type { EnterpriseShowcase } from '@/types'
import * as mock from '@/mock/handlers/enterprises'

/** GET /api/app/enterprises/:id — 企业展示页（showcaseStatus=published 才可见） */
export async function fetchEnterpriseShowcase(id: string): Promise<EnterpriseShowcase> {
  if (apiMode === 'mock') return mock.fetchEnterpriseShowcase(id)
  return httpGet<EnterpriseShowcase>(`/enterprises/${id}`)
}

/** POST /api/app/showcase-requests — 展示页发布申请（→ 管理端审核联动 showcaseStatus） */
export async function createShowcaseRequest(enterpriseId: string, note: string): Promise<void> {
  if (apiMode === 'mock') return mock.createShowcaseRequest(enterpriseId, note)
  await httpPost('/showcase-requests', { enterpriseId, note })
}
