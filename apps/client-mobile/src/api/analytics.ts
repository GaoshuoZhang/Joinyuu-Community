import { apiMode, httpPost } from './http'
import * as mock from '@/mock/handlers/analytics'

/** [MOCK-ONLY] Mock 埋点：记录关键行为到漏斗计数器（接入期为真实埋点上报）。 */
export async function trackEvent(name: string, payload?: Record<string, string | number>): Promise<void> {
  if (apiMode === 'mock') return mock.trackEvent(name, payload)
  if (!localStorage.getItem('joinyuu_client_token')) return
  // 埋点为旁路：网络失败不得影响搜索等业务交互。
  await httpPost('/analytics/events', { name, payload }).catch(() => undefined)
}
