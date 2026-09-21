/* HTTP 封装
 * 统一 fetch + Bearer token + 包络解包（body.data）；开发经 vite proxy 转发到
 * http://127.0.0.1:7757，生产由部署期网关统一转发 /api。
 */

import { resetAuth } from '@/stores/auth'

const TOKEN_KEY = 'joinyuu_admin_token'
const BASE_PATH = '/api/admin'
/* 请求超时（ms）：后端挂起时主动中止，避免无限挂载 */
const REQUEST_TIMEOUT = 30_000

/** 带 HTTP 状态码的错误：调用方据此区分「记录不存在（404）」与其他失败 */
export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** 是否记录不存在（404）；超时/断网等无状态码错误返回 false */
export function isNotFound(error: unknown): boolean {
  return error instanceof HttpError && error.status === 404
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface Envelope<T> {
  code: number
  data: T
  message?: string
}

/* 核心请求：成功返回 body.data；401 统一重置登录态并跳登录；非 0 业务码抛 body.message；
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
    resetAuth()
    window.location.hash = '#/login'
    throw new HttpError(payload?.message ?? '登录已过期，请重新登录', 401)
  }

  if (!res.ok || payload == null || payload.code !== 0) {
    throwError(res.status, payload?.message)
  }

  return payload.data as T
}

/* 密码过期 403：引导到修改密码页（当前已是该页则不重复跳转）；错误仍抛出由页面提示 */
function throwError(status: number, message?: string): never {
  const text = message ?? `请求失败（${status}）`
  if (status === 403 && text.includes('密码已过期')) {
    const target = '#/system/change-password'
    if (window.location.hash !== target) window.location.hash = target
  }
  throw new HttpError(text, status)
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
    resetAuth()
    window.location.hash = '#/login'
    throw new HttpError(payload?.message ?? '登录已过期，请重新登录', 401)
  }

  if (!res.ok || payload == null || payload.code !== 0) {
    throwError(res.status, payload?.message)
  }

  return payload.data as T
}
