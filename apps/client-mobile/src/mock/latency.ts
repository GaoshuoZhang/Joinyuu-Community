import { ApiError, MOCK_LATENCY } from '@/api/http'

/** 模拟网络延迟与包络错误抛出（Mock handlers 专用） */
export function delay(ms = MOCK_LATENCY): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 抛业务错误（code/message 与后端错误包络同形态） */
export function fail(code: number, message: string): never {
  throw new ApiError(code, message)
}

export async function withLatency<T>(value: () => T, ms = MOCK_LATENCY): Promise<T> {
  await delay(ms)
  return value()
}
