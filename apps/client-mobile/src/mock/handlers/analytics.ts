import { trackMockEvent } from '@/mock/db'
import { withLatency } from '@/mock/latency'

/* [MOCK-ONLY] v37 Mock 埋点 handler：写入漏斗计数器（DevTools 可见），不进入真实后端契约。 */

export async function trackEvent(name: string, _payload?: Record<string, string | number>): Promise<void> {
  await withLatency(() => {
    trackMockEvent(name)
  }, 40)
}
