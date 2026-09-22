import { httpPost } from './http'

/** 记录关键行为；旁路上报。 */
export async function trackEvent(name: string, payload?: Record<string, string | number>): Promise<void> {
  if (!localStorage.getItem('joinyuu_client_token')) return
  // 埋点为旁路：网络失败不得影响搜索等业务交互。
  await httpPost('/analytics/events', { name, payload }).catch(() => undefined)
}
