/* 请求封装：统一 fetch + Bearer token + 包络解包（body.data）+ 统一错误 + 401 拦截。
 * 开发经 vite proxy 转发到 http://127.0.0.1:7757，生产由部署期网关统一转发 /api。
 * 视图层只依赖 src/api/*.ts 的函数签名。 */

export class ApiError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

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

/** 列表默认分页大小：一次取满整页，避免后端默认 pageSize=10 导致第 11 条起不可见 */
export const DEFAULT_LIST_PAGE_SIZE = 100

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

/** 含反斜杠或控制字符的地址一律拒绝：WHATWG 会把 '\\' 视作 '/'（如 '/\evil.com'），
 * 仅凭前缀判断会把外域误判为站内并导致令牌外泄。 */
function hasUnsafeTargetChars(path: string): boolean {
  return /[\\\u0000-\u001f\u007f]/.test(path)
}

/** 目标是否可作为站内下载地址：统一用 URL 解析判定（解析后 origin 与当前站点一致）。 */
function isSameOriginTarget(path: string): boolean {
  if (hasUnsafeTargetChars(path)) return false
  try {
    return new URL(path, location.origin).origin === location.origin
  } catch {
    return false
  }
}

/** 下载需鉴权的二进制/文件响应（不走 JSON 包络）。
 * 防令牌外泄：仅站内同源目标附带 Authorization，跨域/协议相对地址一律不带。 */
export async function httpDownload(path: string): Promise<Blob> {
  const headers = new Headers()
  if (isSameOriginTarget(path)) {
    const token = readToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(path, { headers, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new ApiError(408, '请求超时，请重试')
    throw new ApiError(0, '网络异常，请稍后重试')
  } finally {
    window.clearTimeout(timer)
  }
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    throw new ApiError(res.status, '文件下载失败，请稍后重试')
  }
  return res.blob()
}

/** multipart 上传（图片/PDF 等；POST /api/app/uploads） */
export function httpUpload<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: 'POST', body: form })
}
