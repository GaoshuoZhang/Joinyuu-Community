import type { AuthResult, LoginPayload, RegisterPayload } from '@/types'
import { accounts, appConfig, noticesByUid } from '@/mock/db'
import { clearToken, issueToken, readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 认证 handlers。多身份 JWT 签发为后端缺口 §7-4；验证码固定 8888（[MOCK-ONLY]）。 */
const MOCK_CAPTCHA = '8888'

function toAuthResult(uid: string): AuthResult {
  const account = accounts.find((a) => a.uid === uid)
  if (!account) fail(404, '账号不存在')
  return {
    token: issueToken(account.uid, account.identities),
    uid: account.uid,
    name: account.nickname,
    identities: account.identities,
    points: account.points,
  }
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  return withLatency(() => {
    if (payload.captchaCode.trim().toUpperCase() !== MOCK_CAPTCHA) fail(400, '验证码错误或已过期')
    const account = accounts.find((a) => a.phone === payload.phone.trim())
    if (!account) fail(401, '账号或密码错误，请重新输入')
    if (account.status === 'frozen') fail(403, '账号已冻结，如有疑问请联系社区管理员')
    /* Mock 宽松校验：任意非空密码可登录（devtools 可关）；接入后为真实密码校验 */
    if (!payload.password) fail(401, '账号或密码错误，请重新输入')
    return toAuthResult(account.uid)
  })
}

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  return withLatency(() => {
    if (!appConfig.registrationOpen) fail(400, '注册暂未开放')
    if (payload.captchaCode.trim() !== MOCK_CAPTCHA) fail(400, '验证码错误或已过期')
    if (payload.password !== payload.confirmPassword) fail(400, '两次输入的密码不一致')
    const phone = payload.phone.trim()
    if (!/^1\d{10}$/.test(phone)) fail(400, '请输入正确的手机号')
    if (accounts.some((a) => a.phone === phone)) fail(409, '该手机号已注册')
    const uid = 'U' + String(1020 + accounts.length)
    const nickname = payload.nickname?.trim() || `岛民${uid.slice(1)}`
    accounts.push({
      uid,
      phone,
      password: payload.password,
      nickname,
      status: 'active',
      points: 0,
      identities: [{ type: 'individual' }],
      registeredAt: new Date().toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-'),
    })
    noticesByUid[uid] = [
      { id: `UN${Date.now()}`, type: 'system', title: '欢迎来到聚屿社区', content: '完善资料并提交入驻申请，解锁社区个体身份与更多功能。', at: new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16), read: false, link: '/me' },
    ]
    return toAuthResult(uid)
  })
}

export async function logout(): Promise<void> {
  await withLatency(() => clearToken(), 150)
}

/** 刷新后按 token 还原登录态（token 过期/损坏返回 null） */
export async function restoreSession(): Promise<AuthResult | null> {
  const payload = readPayload()
  if (!payload) return null
  const account = accounts.find((a) => a.uid === payload.sub)
  if (!account || account.status === 'frozen') {
    clearToken()
    return null
  }
  return withLatency(
    () => ({
      token: localStorage.getItem('joinyuu_client_token') ?? '',
      uid: account.uid,
      name: account.nickname,
      identities: account.identities,
      points: account.points,
    }),
    120,
  )
}
