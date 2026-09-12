/* 请求封装：包络解包 + 统一错误 + 401 拦截。
 * Mock 模式（VITE_API_MODE 缺省为 mock）下由 src/mock/handlers 提供实现；
 * http 模式走 /api 真实请求（M2-R 接入期启用）。视图层只依赖 src/api/*.ts 的函数签名。 */

export class ApiError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

/** Mock 延迟（毫秒），模拟真实网络 */
export const MOCK_LATENCY = 260

type Envelope<T> = { code: number; data: T }
type ErrorEnvelope = { code: number; message: string }

function readToken(): string {
  return localStorage.getItem('joinyuu_client_token') ?? ''
}

function handleUnauthorized() {
  localStorage.removeItem('joinyuu_client_token')
  if (!location.hash.startsWith('#/login')) {
    location.hash = `#/login?redirect=${encodeURIComponent(location.hash.slice(1) || '/')}`
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = readToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`/api/app${path}`, { ...init, headers })
  const body = (await res.json().catch(() => null)) as (Envelope<T> & Partial<ErrorEnvelope>) | null
  if (!res.ok || !body || body.code !== 0) {
    const code = body?.code ?? res.status
    const message = body?.message ?? '请求失败，请稍后重试'
    if (res.status === 401) handleUnauthorized()
    throw new ApiError(code, message)
  }
  return body.data
}

export function httpGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

export function httpPost<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })
}

export function httpPut<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: 'PUT', body: data === undefined ? undefined : JSON.stringify(data) })
}

export const apiMode: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
