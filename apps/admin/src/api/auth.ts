import { delay } from './utils'

/* 认证接口（Mock）
 * TODO: 替换为 POST /api/admin/auth/login
 * 入参 { username, password }，返回 { code: 0, data: { token, name } }
 * 演示账号：admin / admin123
 */
export async function login(username: string, password: string): Promise<{ token: string; name: string }> {
  await delay(500)
  if (username === 'admin' && password === 'admin123') {
    return { token: 'mock-jwt-token-' + Date.now(), name: '社区管理员' }
  }
  throw new Error('账号或密码错误，请重新输入')
}

/* TODO: 替换为 POST /api/admin/auth/logout */
export async function logout(): Promise<{ code: number }> {
  await delay(200)
  return { code: 0 }
}
