import { httpGet, httpPost } from './http'

/* 认证接口
 * POST /api/admin/auth/login
 * 入参 { username, password }，返回 { code: 0, data: { token, name } }
 * 登录响应返回 permissions（角色权限集合；无角色管理员为空数组，前端不再兜底全量）
 * 与 dataScope（数据范围域集合；空数组 = 不限制全部域）
 * 演示账号：admin / admin123
 */
export interface LoginResult {
  token: string
  name: string
  permissions?: string[]
  dataScope?: string[]
  /** 密码已过期：登录成功但仅允许修改密码；前端应跳转改密页 */
  passwordExpired?: boolean
}

export async function login(
  username: string,
  password: string,
  captcha?: { captchaId: string; captchaCode: string },
): Promise<LoginResult> {
  return httpPost<LoginResult>('/auth/login', { username, password, ...(captcha ? captcha : {}) })
}

/* POST /api/admin/auth/logout */
export async function logout(): Promise<{ code: number }> {
  return httpPost<{ code: number }>('/auth/logout')
}

/* ---------- 登录安全 ---------- */

export interface CaptchaResult {
  captchaId: string
  /** 验证码图片（dataURL，后端生成 SVG） */
  image: string
}

/** GET /api/admin/auth/captcha */
export async function fetchCaptcha(): Promise<CaptchaResult> {
  return httpGet<CaptchaResult>('/auth/captcha')
}

/** POST /api/admin/auth/change-password，入参 { oldPassword, newPassword }
 * 原密码校验 → 改密 → 当前账号全部会话强制下线 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>('/auth/change-password', { oldPassword, newPassword })
}

export interface AdminSession {
  jti: string
  username: string
  name: string
  ip: string
  device: string
  loginAt: string
}

/** GET /api/admin/auth/sessions — 在线会话列表（Redis 会话索引） */
export async function fetchSessions(): Promise<AdminSession[]> {
  return httpGet<AdminSession[]>('/auth/sessions')
}

/** POST /api/admin/auth/sessions/:jti/kick — 强制下线（黑名单 + 删会话） */
export async function kickSession(jti: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/auth/sessions/${jti}/kick`)
}

/** POST /api/admin/auth/sessions/kick-all — 一键强制下线其余全部会话（当前会话保留） */
export async function kickAllSessions(): Promise<{ code: number; kicked: number }> {
  return httpPost<{ code: number; kicked: number }>('/auth/sessions/kick-all')
}
