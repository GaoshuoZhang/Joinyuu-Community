import { apiMode, httpPost } from './http'

/** 记录关键行为；HTTP 模式旁路上报，Mock 模式写入开发者工具计数器。 */
export async function trackEvent(name: string, payload?: Record<string, string | number>): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/analytics')).trackEvent(name, payload)
  if (!localStorage.getItem('joinyuu_client_token')) return
  // 埋点为旁路：网络失败不得影响搜索等业务交互。
  await httpPost('/analytics/events', { name, payload }).catch(() => undefined)
}
