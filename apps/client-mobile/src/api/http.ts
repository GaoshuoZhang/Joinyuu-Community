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

/** 401 统一处理：清 token/身份并通知入口层（history 路由跳转由 main.ts 监听事件执行） */
function handleUnauthorized() {
  localStorage.removeItem('joinyuu_client_token')
  localStorage.removeItem('joinyuu_client_identity')
  window.dispatchEvent(
    new CustomEvent('joinyuu:unauthorized', {
      detail: { redirect: location.pathname + location.search },
    }),
  )
}

/** 请求超时（v38）：避免弱网/断网时页面无限等待 */
const REQUEST_TIMEOUT_MS = 15_000

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  /* FormData 上传由浏览器自动带 boundary，不能手动设置 Content-Type */
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = readToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`/api/app${path}`, { ...init, headers, signal: controller.signal })
  } catch (error) {
    if (!navigator.onLine) throw new ApiError(0, '当前网络不可用，请检查网络后重试')
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError(408, '请求超时，请重试')
    throw new ApiError(0, '网络异常，请稍后重试')
  } finally {
    window.clearTimeout(timer)
  }
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

export function httpDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

/** 下载需鉴权的二进制/文件响应（不走 JSON 包络）。 */
export async function httpDownload(path: string): Promise<Blob> {
  const headers = new Headers()
  const token = readToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(path, { headers })
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throw new ApiError(res.status, '文件下载失败，请稍后重试')
  }
  return res.blob()
}

/** multipart 上传（图片/PDF 等；缺口 §7.1-6 POST /api/app/uploads） */
export function httpUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form })
}

export const apiMode: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
