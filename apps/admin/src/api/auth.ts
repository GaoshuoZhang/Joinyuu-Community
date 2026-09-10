import { httpPost } from './http'

/* 认证接口
 * 已接入 M1 真实接口：POST /api/admin/auth/login
 * 入参 { username, password }，返回 { code: 0, data: { token, name } }
 * 演示账号：admin / admin123
 */
export async function login(username: string, password: string): Promise<{ token: string; name: string }> {
  return httpPost<{ token: string; name: string }>('/auth/login', { username, password })
}

/* 已接入 M1 真实接口：POST /api/admin/auth/logout */
export async function logout(): Promise<{ code: number }> {
  return httpPost<{ code: number }>('/auth/logout')
}
