import { apiMode, httpGet, httpPost, MOCK_LATENCY } from './http'
import type { AuthResult, LoginPayload, RegisterPayload } from '@/types'
import * as mock from '@/mock/handlers/auth'

/** POST /api/app/auth/login — 登录（多身份 JWT 签发为缺口 §7-4，接入期实现） */
export async function login(payload: LoginPayload): Promise<AuthResult> {
  if (apiMode === 'mock') return mock.login(payload)
  return httpPost<AuthResult>('/auth/login', payload)
}

/** POST /api/app/auth/register — 注册（受 registrationOpen 开关控制；默认授予 individual 身份） */
export async function register(payload: RegisterPayload): Promise<AuthResult> {
  if (apiMode === 'mock') return mock.register(payload)
  return httpPost<AuthResult>('/auth/register', payload)
}

/** POST /api/app/auth/logout — 登出（黑名单复用 auth:blacklist:{jti}） */
export async function logout(): Promise<void> {
  if (apiMode === 'mock') return mock.logout()
  await httpPost('/auth/logout')
}

/** 图形验证码：Mock 模式固定 8888（[MOCK-ONLY]，接入后走 GET /api/app/auth/captcha） */
export async function getCaptcha(): Promise<{ captchaId: string; image: string }> {
  if (apiMode === 'mock') {
    await new Promise((r) => setTimeout(r, 120))
    return { captchaId: 'mock', image: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>') }
  }
  /* v40：改走统一请求封装（包络解包 + 401 处理），与其他接口一致 */
  return httpGet<{ captchaId: string; image: string }>('/auth/captcha')
}

/** Mock 会话恢复（刷新后按 token 还原登录态）；http 模式由 GET /api/app/me 承担 */
export async function restoreSession(): Promise<AuthResult | null> {
  if (apiMode === 'mock') return mock.restoreSession()
  await new Promise((r) => setTimeout(r, MOCK_LATENCY))
  return null
}

/** [MOCK-ONLY] v38 找回密码（手机号 + 短信验证码 + 新密码；接入期接短信通道）。 */
export async function resetPassword(payload: { phone: string; captchaCode: string; password: string }): Promise<void> {
  if (apiMode === 'mock') return mock.resetPassword(payload)
  await httpPost('/auth/reset-password', payload)
}

/** [MOCK-ONLY] v38 更换绑定手机号（登录态 + 新手机号验证码）。 */
export async function changePhone(payload: { phone: string; captchaCode: string }): Promise<void> {
  if (apiMode === 'mock') return mock.changePhone(payload)
  await httpPost('/auth/change-phone', payload)
}
