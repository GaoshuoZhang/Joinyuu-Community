import { apiMode, httpPost } from './http'
import * as mock from '@/mock/handlers/analytics'

/** [MOCK-ONLY] Mock 埋点：记录关键行为到漏斗计数器（接入期为真实埋点上报）。 */
export async function trackEvent(name: string, payload?: Record<string, string | number>): Promise<void> {
  if (apiMode === 'mock') return mock.trackEvent(name, payload)
  await httpPost('/analytics/events', { name, ...payload })
}
