import { httpGet, httpPost } from './http'
import type {
  AuthResult,
  EmailPurpose,
  LoginPayload,
  RecoveryChannels,
  RegisterPayload,
  SendCodeResult,
  SmsPurpose,
  UserProfile,
} from '@/types'

/** POST /api/app/auth/login — 登录并签发包含多身份快照的 app JWT。 */
export async function login(payload: LoginPayload): Promise<AuthResult> {
  return httpPost<AuthResult>('/auth/login', payload)
}

/** POST /api/app/auth/register — 注册（受 registrationOpen 开关控制；默认授予 individual 身份） */
export async function register(payload: RegisterPayload): Promise<AuthResult> {
  return httpPost<AuthResult>('/auth/register', payload)
}

/** POST /api/app/auth/logout — 登出（黑名单复用 auth:blacklist:{jti}） */
export async function logout(): Promise<void> {
  await httpPost('/auth/logout')
}

/** 图形验证码（服务端生成，SVG dataURL）。 */
export async function getCaptcha(): Promise<{ captchaId: string; image: string }> {
  /* v40：改走统一请求封装（包络解包 + 401 处理），与其他接口一致 */
  return httpGet<{ captchaId: string; image: string }>('/auth/captcha')
}

/* ---------- 通知渠道可用性（注册/验证入口据此开放） ---------- */

/** GET /api/app/auth/sms/available — 短信通道是否可用。 */
export async function fetchSmsAvailable(): Promise<boolean> {
  const result = await httpGet<{ available: boolean }>('/auth/sms/available')
  return result.available
}

/** GET /api/app/auth/email/available — 邮箱通道是否可用。 */
export async function fetchEmailAvailable(): Promise<boolean> {
  const result = await httpGet<{ available: boolean }>('/auth/email/available')
  return result.available
}

/* ---------- 验证码下发 ---------- */

/** POST /api/app/auth/sms/send — 发送短信验证码（phone/ip/device 三维频控）。 */
export async function sendSmsCode(payload: { phone: string; purpose: SmsPurpose; deviceId?: string }): Promise<SendCodeResult> {
  return httpPost<SendCodeResult>('/auth/sms/send', payload)
}

/** POST /api/app/auth/email/send — 发送邮箱验证码（email/ip/device 三维频控）。 */
export async function sendEmailCode(payload: { email: string; purpose: EmailPurpose; deviceId?: string }): Promise<SendCodeResult> {
  return httpPost<SendCodeResult>('/auth/email/send', payload)
}

/** GET /api/app/auth/recovery-channels — 找回密码前置：查询账号已验证可信渠道（脱敏）。 */
export async function fetchRecoveryChannels(identifier: string): Promise<RecoveryChannels> {
  return httpGet<RecoveryChannels>(`/auth/recovery-channels?identifier=${encodeURIComponent(identifier)}`)
}

/** POST /api/app/auth/reset-code/send — 找回密码发码：服务端按账号解析可信渠道并投递（客户端只传账号标识）。 */
export async function sendResetCode(payload: { identifier: string; channel: 'email' | 'phone'; deviceId?: string }): Promise<SendCodeResult> {
  return httpPost<SendCodeResult>('/auth/reset-code/send', payload)
}

/* ---------- 密码与绑定 ---------- */

/** POST /api/app/auth/reset-password — 凭可信渠道验证码重置密码（成功后全端登出）。 */
export async function resetPassword(payload: { identifier: string; channel: 'email' | 'phone'; code: string; newPassword: string }): Promise<void> {
  await httpPost('/auth/reset-password', payload)
}

/** POST /api/app/auth/change-phone — 绑定/更换手机号（须验证新手机号短信码）。 */
export async function changePhone(payload: { newPhone: string; smsCode: string }): Promise<void> {
  await httpPost('/auth/change-phone', payload)
}

/** POST /api/app/auth/change-email — 绑定/更换邮箱（须验证新邮箱邮箱码）。 */
export async function changeEmail(payload: { newEmail: string; code: string }): Promise<void> {
  await httpPost('/auth/change-email', payload)
}

/** 会话恢复（刷新后按 token 还原登录态；由 GET /api/app/me 承担） */
export async function restoreSession(): Promise<AuthResult | null> {
  const token = localStorage.getItem('joinyuu_client_token') ?? ''
  if (!token) return null
  const me = await httpGet<UserProfile>('/me')
  return {
    token,
    uid: me.uid,
    username: me.username,
    name: me.nickname,
    avatar: me.avatar,
    identities: me.identities,
    points: me.points,
  }
}
