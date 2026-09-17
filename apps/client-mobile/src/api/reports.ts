import { apiMode, httpPost } from './http'
import type { ReportPayload } from '@/types'
import * as mock from '@/mock/handlers/reports'

/** [MOCK-ONLY] 提交举报（需求/文章/企业名片）；接入期为 POST /api/app/reports。 */
export async function submitReport(payload: ReportPayload): Promise<void> {
  if (apiMode === 'mock') return mock.submitReport(payload)
  await httpPost('/reports', payload)
}
