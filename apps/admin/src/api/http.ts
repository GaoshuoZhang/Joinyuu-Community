/* HTTP 封装
 * 统一 fetch + Bearer token + 包络解包（body.data）；开发经 vite proxy 转发到
 * http://127.0.0.1:7757，生产由部署期网关统一转发 /api。
 */

const TOKEN_KEY = 'joinyuu_admin_token'
const NAME_KEY = 'joinyuu_admin_name'
const PERMS_KEY = 'joinyuu_admin_perm_codes'
const BASE_PATH = '/api/admin'
/* 请求超时（ms）：后端挂起时主动中止，避免无限挂载 */
const REQUEST_TIMEOUT = 30_000

/* 401：清理全部登录缓存（token / 名称 / 权限），避免残留旧权限集合 */
function clearAuthStorage(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(NAME_KEY)
  localStorage.removeItem(PERMS_KEY)
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface Envelope<T> {
  code: number
  data: T
  message?: string
}

/* 核心请求：成功返回 body.data；401 清 token 跳登录；非 0 业务码抛 body.message；
 * 超过 REQUEST_TIMEOUT 主动 Abort 抛"请求超时" */
export async function http<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  let res: Response
  try {
    res = await fetch(`${BASE_PATH}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    throw new Error('网络异常，请检查网络后重试')
  } finally {
    clearTimeout(timer)
  }

  let payload: Envelope<T> | null = null
  try {
    payload = (await res.json()) as Envelope<T>
  } catch {
    payload = null
  }

  if (res.status === 401) {
    clearAuthStorage()
    window.location.hash = '#/login'
    throw new Error(payload?.message ?? '登录已过期，请重新登录')
  }

  if (!res.ok || payload == null || payload.code !== 0) {
    throw new Error(payload?.message ?? `请求失败（${res.status}）`)
  }

  return payload.data as T
}

export function httpGet<T>(path: string): Promise<T> {
  return http<T>('GET', path)
}

export function httpPost<T>(path: string, body?: unknown): Promise<T> {
  return http<T>('POST', path, body)
}

export function httpPut<T>(path: string, body?: unknown): Promise<T> {
  return http<T>('PUT', path, body)
}

export function httpPatch<T>(path: string, body?: unknown): Promise<T> {
  return http<T>('PATCH', path, body)
}

export function httpDelete<T>(path: string): Promise<T> {
  return http<T>('DELETE', path)
}

/* multipart 上传：不设置 Content-Type（由浏览器补 boundary），其余与 http 一致 */
export async function httpUpload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  let res: Response
  try {
    res = await fetch(`${BASE_PATH}${path}`, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    throw new Error('网络异常，请检查网络后重试')
  } finally {
    clearTimeout(timer)
  }

  let payload: Envelope<T> | null = null
  try {
    payload = (await res.json()) as Envelope<T>
  } catch {
    payload = null
  }

  if (res.status === 401) {
    clearAuthStorage()
    window.location.hash = '#/login'
    throw new Error(payload?.message ?? '登录已过期，请重新登录')
  }

  if (!res.ok || payload == null || payload.code !== 0) {
    throw new Error(payload?.message ?? `请求失败（${res.status}）`)
  }

  return payload.data as T
}
