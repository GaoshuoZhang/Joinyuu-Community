import type { AuthResult, EmailPurpose, LoginPayload, RecoveryChannels, RegisterPayload, SendCodeResult, SmsPurpose } from '@/types'
import { accounts, appConfig, nextMockId, noticesByUid, nowStamp, trackMockEvent } from '@/mock/db'
import { clearToken, issueToken, readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 认证 handlers。多身份 JWT 签发为后端缺口 §7-4；验证码固定 8888（[MOCK-ONLY]）。 */
const MOCK_CAPTCHA = '8888'
const SMS_PURPOSES: readonly SmsPurpose[] = ['register', 'reset_password', 'change_phone', 'login']
const EMAIL_PURPOSES: readonly EmailPurpose[] = ['register', 'reset_password', 'change_email']
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^1\d{10}$/

function toAuthResult(uid: string): AuthResult {
  const account = accounts.find((a) => a.uid === uid)
  if (!account) fail(404, '账号不存在')
  return {
    token: issueToken(account.uid, account.identities),
    uid: account.uid,
    username: account.username,
    name: account.nickname,
    avatar: account.avatar,
    identities: account.identities,
    points: account.points,
  }
}

/** 按登录标识（手机号 / 邮箱 / 用户名）定位账号 */
function findByIdentifier(identifier: string) {
  const raw = (identifier ?? '').trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  return accounts.find((a) =>
    (PHONE_PATTERN.test(raw) && a.phone === raw)
    || (a.email !== undefined && a.email.toLowerCase() === lower)
    || a.username.toLowerCase() === lower,
  )
}

/** 注册自动分配用户名：user_ + 6 位小写字母/数字（保证唯一） */
function generateUsername(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let suffix = ''
    for (let i = 0; i < 6; i += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)]
    const candidate = `user_${suffix}`
    if (!accounts.some((a) => a.username === candidate)) return candidate
  }
  return `user_${Date.now().toString(36).slice(-6)}`
}

/** 注册自动分配昵称：岛民 + 6 位数字（保证唯一） */
function generateNickname(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `岛民${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`
    if (!accounts.some((a) => a.nickname === candidate)) return candidate
  }
  return `岛民${String(Date.now()).slice(-6)}`
}

function normalizeGender(value?: string): 'male' | 'female' | 'unknown' {
  if (value === 'male' || value === '男') return 'male'
  if (value === 'female' || value === '女') return 'female'
  return 'unknown'
}

/** 邮箱脱敏：a***@domain */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return '***'
  return `${name.slice(0, 1)}***@${domain}`
}

/** 手机号脱敏：138****0000 */
function maskPhone(phone: string): string {
  if (!PHONE_PATTERN.test(phone)) return '***'
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

export async function login(payload: LoginPayload): Promise<AuthResult> {
  return withLatency(() => {
    if (payload.captchaCode.trim().toUpperCase() !== MOCK_CAPTCHA) fail(400, '验证码错误或已过期')
    const account = findByIdentifier(payload.identifier)
    if (!account) fail(401, '账号或密码错误，请重新输入')
    if (account.status === 'frozen') fail(403, '账号已冻结，如有疑问请联系社区管理员')
    /* Mock 宽松校验：任意非空密码可登录（devtools 可关）；接入后为真实密码校验 */
    if (!payload.password) fail(401, '账号或密码错误，请重新输入')
    trackMockEvent('login')
    return toAuthResult(account.uid)
  })
}

export async function register(payload: RegisterPayload): Promise<AuthResult> {
  return withLatency(() => {
    if (!appConfig.registrationOpen) fail(400, '注册暂未开放')
    if (!payload.agreed) fail(400, '请先阅读并同意《用户协议》与《隐私政策》')
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(payload.password)) fail(400, '密码至少 8 位且包含字母与数字')

    const channel = payload.channel ?? 'email'
    const email = (payload.email ?? '').trim().toLowerCase()
    const phone = (payload.phone ?? '').trim()

    if (channel === 'email') {
      if (!email) fail(400, '请输入邮箱')
      if (!EMAIL_PATTERN.test(email)) fail(400, '邮箱格式不正确')
      if (payload.code.trim() !== MOCK_CAPTCHA) fail(400, '邮箱验证码错误或已过期')
      if (accounts.some((a) => a.email?.toLowerCase() === email)) fail(409, '该邮箱已注册')
    } else {
      if (!phone) fail(400, '请输入手机号')
      if (!PHONE_PATTERN.test(phone)) fail(400, '手机号格式不正确')
      if (payload.code.trim() !== MOCK_CAPTCHA) fail(400, '短信验证码错误或已过期')
      if (accounts.some((a) => a.phone === phone)) fail(409, '该手机号已注册')
    }

    const uid = nextMockId('U')
    const username = generateUsername()
    const nickname = generateNickname()
    accounts.push({
      uid,
      username,
      phone: channel === 'phone' ? phone : '',
      email: channel === 'email' ? email : undefined,
      phoneVerified: channel === 'phone',
      emailVerified: channel === 'email',
      password: payload.password,
      nickname,
      status: 'active',
      points: 0,
      identities: [{ type: 'individual' }],
      registeredAt: nowStamp(),
      gender: normalizeGender(payload.gender),
      agreementAt: nowStamp(),
    })
    noticesByUid[uid] = [
      { id: nextMockId('UN'), type: 'system', title: '欢迎来到聚屿社区', content: `注册成功，你的用户名是 ${username}，完善资料并提交入驻申请可解锁更多功能。`, at: nowStamp(), read: false, link: '/me' },
    ]
    trackMockEvent('register')
    return toAuthResult(uid)
  })
}

export async function logout(): Promise<void> {
  await withLatency(() => clearToken(), 150)
}

/* ---------- 通知渠道可用性（[MOCK-ONLY]：演示环境下邮箱/短信通道均可用） ---------- */

export async function fetchSmsAvailable(): Promise<boolean> {
  return withLatency(() => true, 80)
}

export async function fetchEmailAvailable(): Promise<boolean> {
  return withLatency(() => true, 80)
}

/* ---------- 验证码下发（[MOCK-ONLY]：固定 8888；真实后端需通道与频率限制） ---------- */

export async function sendSmsCode(payload: { phone: string; purpose: SmsPurpose; deviceId?: string }): Promise<SendCodeResult> {
  return withLatency(() => {
    if (!SMS_PURPOSES.includes(payload.purpose)) fail(400, '验证码用途不合法')
    if (!(payload.phone ?? '').trim()) fail(400, '请输入手机号')
    return { expiresInSec: 300, devCode: MOCK_CAPTCHA }
  }, 180)
}

export async function sendEmailCode(payload: { email: string; purpose: EmailPurpose; deviceId?: string }): Promise<SendCodeResult> {
  return withLatency(() => {
    if (!EMAIL_PURPOSES.includes(payload.purpose)) fail(400, '验证码用途不合法')
    if (!(payload.email ?? '').trim()) fail(400, '请输入邮箱')
    return { expiresInSec: 300, devCode: MOCK_CAPTCHA }
  }, 180)
}

/* ---------- 找回密码（[MOCK-ONLY]） ---------- */

/** 找回密码前置：返回账号已验证可信渠道（脱敏）；账号不存在返回 400 */
export async function fetchRecoveryChannels(identifier: string): Promise<RecoveryChannels> {
  return withLatency(() => {
    const account = findByIdentifier(identifier)
    if (!account) fail(400, '该账号未注册')
    return {
      email: account.email && account.emailVerified ? maskEmail(account.email) : null,
      phone: account.phone && account.phoneVerified ? maskPhone(account.phone) : null,
    }
  }, 160)
}

/** 找回密码发码：服务端按账号解析可信渠道并投递（客户端只传账号标识） */
export async function sendResetCode(payload: { identifier: string; channel: 'email' | 'phone'; deviceId?: string }): Promise<SendCodeResult> {
  return withLatency(() => {
    const account = findByIdentifier(payload.identifier)
    if (!account) fail(400, '该账号未注册')
    if (payload.channel === 'email') {
      if (!account.email || !account.emailVerified) fail(400, '该账号未绑定已验证的邮箱，无法通过邮箱验证')
    } else if (!account.phone || !account.phoneVerified) {
      fail(400, '该账号未绑定已验证的手机号，无法通过短信验证')
    }
    return { expiresInSec: 300, devCode: MOCK_CAPTCHA }
  }, 180)
}

/** 找回密码：须用账号已验证的可信渠道验证 */
export async function resetPassword(payload: { identifier: string; channel: 'email' | 'phone'; code: string; newPassword: string }): Promise<void> {
  await withLatency(() => {
    const account = findByIdentifier(payload.identifier)
    if (!account) fail(400, '该账号未注册')
    if (payload.channel === 'email') {
      if (!account.email || !account.emailVerified) fail(400, '该账号未绑定已验证的邮箱，无法通过邮箱验证')
      if (payload.code.trim() !== MOCK_CAPTCHA) fail(400, '邮箱验证码错误或已过期')
    } else {
      if (!account.phone || !account.phoneVerified) fail(400, '该账号未绑定已验证的手机号，无法通过短信验证')
      if (payload.code.trim() !== MOCK_CAPTCHA) fail(400, '短信验证码错误或已过期')
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(payload.newPassword)) fail(400, '密码至少 8 位且包含字母与数字')
    account.password = payload.newPassword
  }, 220)
}

/* ---------- 绑定 / 更换手机号、邮箱（[MOCK-ONLY]，需登录态） ---------- */

export async function changePhone(payload: { newPhone: string; smsCode: string }): Promise<void> {
  await withLatency(() => {
    const session = readPayload()
    if (!session) fail(401, '未登录或登录已过期')
    const account = accounts.find((a) => a.uid === session.sub)
    if (!account) fail(404, '账号不存在')
    const newPhone = (payload.newPhone ?? '').trim()
    if (!PHONE_PATTERN.test(newPhone)) fail(400, '手机号格式不正确')
    if (payload.smsCode.trim() !== MOCK_CAPTCHA) fail(400, '短信验证码错误或已过期')
    if (accounts.some((a) => a.phone === newPhone && a.uid !== account.uid)) fail(409, '该手机号已绑定其他账号')
    account.phone = newPhone
    account.phoneVerified = true
  }, 220)
}

export async function changeEmail(payload: { newEmail: string; code: string }): Promise<void> {
  await withLatency(() => {
    const session = readPayload()
    if (!session) fail(401, '未登录或登录已过期')
    const account = accounts.find((a) => a.uid === session.sub)
    if (!account) fail(404, '账号不存在')
    const newEmail = (payload.newEmail ?? '').trim().toLowerCase()
    if (!EMAIL_PATTERN.test(newEmail)) fail(400, '邮箱格式不正确')
    if (payload.code.trim() !== MOCK_CAPTCHA) fail(400, '邮箱验证码错误或已过期')
    if (accounts.some((a) => a.email?.toLowerCase() === newEmail && a.uid !== account.uid)) fail(409, '该邮箱已绑定其他账号')
    account.email = newEmail
    account.emailVerified = true
  }, 220)
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
      username: account.username,
      name: account.nickname,
      avatar: account.avatar,
      identities: account.identities,
      points: account.points,
    }),
    120,
  )
}
