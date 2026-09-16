import { ApiError, MOCK_LATENCY } from '@/api/http'
import { commitMockState, getMockNetworkMode, getPersistenceError } from '@/mock/runtime'

/** 模拟网络延迟与包络错误抛出（Mock handlers 专用） */
export function delay(ms = MOCK_LATENCY): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 抛业务错误（code/message 与后端错误包络同形态） */
export function fail(code: number, message: string): never {
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
