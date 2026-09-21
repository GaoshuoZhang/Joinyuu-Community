import { ApiError, MOCK_LATENCY } from '@/api/http'
import { commitMockState, getMockNetworkMode, getPersistenceError } from '@/mock/runtime'

/** 模拟网络延迟与包络错误抛出（Mock handlers 专用） */
export function delay(ms = MOCK_LATENCY): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 抛业务错误（code/message 与后端错误包络同形态）。
 * 401 且本地已存在令牌时，与 http 模式一致地走「统一未授权通道」：
 * 清理本地令牌并广播事件，避免 mock 模式下会话失效后仍停留为「已登录」假象
 * （登录失败等未登录场景不带令牌，不会触发本分支）。 */
export function fail(code: number, message: string): never {
  if (code === 401 && localStorage.getItem('joinyuu_client_token')) {
    localStorage.removeItem('joinyuu_client_token')
    localStorage.removeItem('joinyuu_client_identity')
    window.dispatchEvent(
      new CustomEvent('joinyuu:unauthorized', {
        detail: { redirect: location.pathname + location.search },
      }),
    )
  }
  throw new ApiError(code, message)
}

export async function withLatency<T>(value: () => T | Promise<T>, ms = MOCK_LATENCY): Promise<T> {
  const mode = getMockNetworkMode()
  if (mode === 'offline') {
    await delay(120)
    fail(0, '当前处于离线模拟，请切换网络场景后重试')
  }
  if (mode === 'error') {
    await delay(ms)
    fail(500, '已模拟服务异常，请稍后重试')
  }
  if (mode === 'timeout') {
    await delay(3000)
    fail(408, '已模拟请求超时，请重试')
  }
  await delay(mode === 'slow' ? Math.max(1800, ms * 5) : ms)
  const result = await value()
  commitMockState()
  const persistenceError = getPersistenceError()
  if (persistenceError) fail(507, `操作已生效，但 Mock 状态保存失败：${persistenceError}`)
  return result
}
