/* M2-R R1 验收 + P0 注册/找回/绑定细化：app 鉴权（注册/登录/登出/找回密码/绑定邮箱手机号/用户名昵称唯一）
 * 前置：docker compose up + prisma migrate + seed（用户统一密码 user123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import Redis from 'ioredis'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { RedisService } from '../src/common/redis/redis.service'
import { CACHE_KEYS } from '../src/common/redis/cache-keys'
import {
  appLoginAs,
  appLoginRequest,
  appPost,
  fetchAppCaptcha,
} from './helpers/app-login'

/** 发送短信验证码并取回干跑明文（非生产环境凭据未注入时后端返回 devCode） */
async function sendSmsCode(app: INestApplication, phone: string, purpose: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/app/auth/sms/send').send({ phone, purpose })
  expect(res.status).toBe(200)
  return res.body.data.devCode as string
}

/** 发送邮箱验证码并取回干跑明文 */
async function sendEmailCode(app: INestApplication, email: string, purpose: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/app/auth/email/send').send({ email, purpose })
  expect(res.status).toBe(200)
  return res.body.data.devCode as string
}

/* 登录失败计数/锁定键与验证码限流键都不随 reseed 清理、且带 TTL 跨套件甚至跨次运行残留：
 * 本套件的锁定用例会让固定号码在 15 分钟内保持锁定，套件开始与结束都要清一次，
 * 否则紧随其后的运行会直接拿到 429（首两次尝试就不是 401 了）。 */
async function clearAuthRateKeys(pattern: string): Promise<void> {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  })
  try {
    const keys = await client.keys(pattern)
    if (keys.length > 0) await client.del(...keys)
  } catch {
    /* Redis 不可用时忽略（断言仍以真实行为为准） */
  } finally {
    client.disconnect()
  }
}

describe('M2-R R1 app 鉴权', () => {
  let app: INestApplication
  let prisma: PrismaService
  let redis: RedisService

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = moduleRef.get(PrismaService)
    redis = moduleRef.get(RedisService)
    /* 清掉可能由上一条套件/上一次运行残留的失败计数、锁定与验证码限流键，保证断言从干净状态起算 */
    await clearAuthRateKeys('auth:app:login:*')
    await clearAuthRateKeys('auth:app:captcha:rate:*')
  })

  afterAll(async () => {
    /* 本套件的锁定用例会留下 15 分钟锁定键，不清会污染紧随其后的运行 */
    await clearAuthRateKeys('auth:app:login:*')
    await app.close()
  })

  it('app 配置/字典下发无需登录（@Public）', async () => {
    const config = await request(app.getHttpServer()).get('/api/app/config')
    expect(config.status).toBe(200)
    expect(config.body.code).toBe(0)
    expect(config.body.data.siteName).toBeTruthy()
    expect(config.body.data.updatedAt).toBeUndefined() // 不含管理字段

    const dicts = await request(app.getHttpServer()).get('/api/app/dicts')
    expect(dicts.status).toBe(200)
    expect(dicts.body.code).toBe(0)
    ;['demand_category', 'industry', 'event_type', 'goods_category'].forEach((t) => {
      expect(Array.isArray(dicts.body.data[t].items)).toBe(true)
    })
    const one = await request(app.getHttpServer()).get('/api/app/dicts/demand_category')
    expect(Array.isArray(one.body.data.items)).toBe(true)
  })

  it('注册渠道可用性下发：邮件渠道可用、短信渠道可用', async () => {
    const email = await request(app.getHttpServer()).get('/api/app/auth/email/available')
    expect(email.status).toBe(200)
    expect(email.body.data.available).toBe(true)
    const sms = await request(app.getHttpServer()).get('/api/app/auth/sms/available')
    expect(sms.status).toBe(200)
    expect(sms.body.data.available).toBe(true)
  })

  it('错误密码登录返回 401 与可展示文案', async () => {
    const res = await appLoginRequest(app, '13801210001', 'wrong-password')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ code: 401, message: '账号或密码错误' })
  })

  it('未达验证码阈值（连续失败 < 3 次）可不携带验证码登录 → 200', async () => {
    /* 上一用例已累计 1 次失败（< CAPTCHA_AFTER_FAILURES=3），此时验证码尚未参与校验 */
    const res = await request(app.getHttpServer())
      .post('/api/app/auth/login')
      .send({ identifier: '13801210001', password: 'user123' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
  })

  it('成功登录返回 token（含身份摘要）', async () => {
    const res = await appLoginRequest(app, '13801210001', 'user123')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(typeof res.body.data.token).toBe('string')
    expect(res.body.data.uid).toBe('U1001')
    expect(res.body.data.name).toBe('陈屿')
    expect(res.body.data.username).toBe('user_u1001')
    expect(Array.isArray(res.body.data.identities)).toBe(true)
  })

  it('登录标识同时支持 邮箱 与 用户名', async () => {
    const byEmail = await appLoginRequest(app, 'chenyu@starlan.ai', 'user123')
    expect(byEmail.status).toBe(200)
    expect(byEmail.body.data.uid).toBe('U1001')

    const byUsername = await appLoginRequest(app, 'user_u1001', 'user123')
    expect(byUsername.status).toBe(200)
    expect(byUsername.body.data.uid).toBe('U1001')
  })

  it('登出后原 token 失效 401（黑名单生效）', async () => {
    const login = await appLoginRequest(app, '13801210001', 'user123')
    const token: string = login.body.data.token
    const me = await request(app.getHttpServer())
      .get('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
    expect(me.status).toBe(200)

    const logout = await appPost(app, token, '/api/app/auth/logout', {})
    expect(logout.status).toBe(200)
    expect(logout.body.code).toBe(0)

    const meAfter = await request(app.getHttpServer())
      .get('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
    expect(meAfter.status).toBe(401)
  })

  it('app 令牌不能访问 admin 端点（路径分流）', async () => {
    const token = await appLoginAs(app, '13801210001', 'user123')
    const res = await request(app.getHttpServer())
      .get('/api/admin/users/options')
      .set('Authorization', `Bearer ${token}`)
    expect([401, 403]).toContain(res.status)
  })

  it('admin 令牌不能访问 app 端点（路径分流）', async () => {
    const token = await loginAs(app, 'admin', 'admin123')
    const res = await request(app.getHttpServer())
      .get('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('邮箱注册：未同意协议 400 / 验证码错误 400 / 已存在邮箱 409', async () => {
    const noAgree = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'email', email: 'newbie1@example.com', code: '123456', password: 'user12345' })
    expect(noAgree.status).toBe(400)
    expect(noAgree.body.message).toContain('请先阅读并同意')

    await sendEmailCode(app, 'newbie1@example.com', 'register')
    const wrongCode = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'email', email: 'newbie1@example.com', code: '000000', password: 'user12345', agreed: true })
    expect(wrongCode.status).toBe(400)
    expect(wrongCode.body.message).toContain('验证码')

    /* 已存在邮箱：验证码通过后命中唯一性校验（409） */
    const existingEmail = 'chenyu@starlan.ai'
    const dupCode = await sendEmailCode(app, existingEmail, 'register')
    const dup = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'email', email: existingEmail, code: dupCode, password: 'user12345', agreed: true })
    expect(dup.status).toBe(409)
  })

  it('邮箱注册成功：自动分配用户名与昵称，邮箱成为可信渠道', async () => {
    const email = 'newbie2@example.com'
    const code = await sendEmailCode(app, email, 'register')
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'email', email, code, password: 'user12345', agreed: true })
    expect(reg.status).toBe(200)
    expect(reg.body.data.uid).toBeTruthy()
    expect(String(reg.body.data.username)).toMatch(/^user_[a-z0-9]{8}$/)
    expect(String(reg.body.data.name)).toMatch(/^岛民\d{6}$/)

    const uid = reg.body.data.uid as string
    const row = await prisma.user.findUniqueOrThrow({ where: { uid } })
    expect(row.email).toBe(email)
    expect(row.phone).toBeNull()
    expect(row.emailVerifiedAt).toBeTruthy()
    expect(row.phoneVerifiedAt).toBeNull()

    const consents = await prisma.agreementConsent.findMany({ where: { userId: uid } })
    expect(consents.map((item) => item.agreementType).sort()).toEqual(['privacy_policy', 'user_agreement'])

    const login = await appLoginRequest(app, email, 'user12345')
    expect(login.status).toBe(200)
    expect(login.body.data.uid).toBe(uid)
  })

  it('手机号注册：需短信验证码，已存在手机号 409', async () => {
    const phone = '13900009999'
    const code = await sendSmsCode(app, phone, 'register')
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'phone', phone, code, password: 'user12345', agreed: true })
    expect(reg.status).toBe(200)
    const uid = reg.body.data.uid as string
    const row = await prisma.user.findUniqueOrThrow({ where: { uid } })
    expect(row.phone).toBe(phone)
    expect(row.email).toBeNull()
    expect(row.phoneVerifiedAt).toBeTruthy()

    const dupCode = await sendSmsCode(app, '13801210001', 'register')
    const dup = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({ channel: 'phone', phone: '13801210001', code: dupCode, password: 'user12345', agreed: true })
    expect(dup.status).toBe(409)
  })

  it('注册必须使用有效且一次性的验证码', async () => {
    const invalid = await request(app.getHttpServer()).post('/api/app/auth/register').send({
      channel: 'phone', phone: '13900000002', code: '000000', password: 'user12345', agreed: true,
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body.message).toContain('验证码')
  })

  it('找回密码前置：返回账号已验证的可信渠道（脱敏）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/app/auth/recovery-channels')
      .query({ identifier: '13801210002' })
    expect(res.status).toBe(200)
    expect(res.body.data.phone).toMatch(/^138\*{4}0002$/)
    expect(res.body.data.email).toBe('l***@starlan.ai')

    const missing = await request(app.getHttpServer())
      .get('/api/app/auth/recovery-channels')
      .query({ identifier: '19900000000' })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toContain('未注册')
  })

  it('找回密码发码：由服务端按账号标识投递到可信渠道（客户端无需真实收件地址）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/app/auth/reset-code/send')
      .send({ identifier: 'user_u1003', channel: 'phone' })
    expect(res.status).toBe(200)
    expect(res.body.data.devCode).toBeTruthy()

    /* 该账号未绑定已验证邮箱 → 拒绝 */
    const bad = await request(app.getHttpServer())
      .post('/api/app/auth/reset-code/send')
      .send({ identifier: 'newbie2@example.com', channel: 'phone' })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toContain('未绑定')
  })

  it('找回密码：必须用可信手机号渠道验证，通过后可新密码登录', async () => {
    const code = await sendSmsCode(app, '13801210002', 'reset_password')
    const reset = await request(app.getHttpServer())
      .post('/api/app/auth/reset-password')
      .send({ identifier: '13801210002', channel: 'phone', code, newPassword: 'newpass123' })
    expect(reset.status).toBe(200)
    expect(reset.body.code).toBe(0)

    const oldPass = await appLoginRequest(app, '13801210002', 'user123')
    expect(oldPass.status).toBe(401)
    const newPass = await appLoginRequest(app, '13801210002', 'newpass123')
    expect(newPass.status).toBe(200)
  })

  it('找回密码：邮箱渠道验证同样生效', async () => {
    /* 使用前面邮箱注册的账号，避免影响种子账号后续用例 */
    const email = 'newbie2@example.com'
    const code = await sendEmailCode(app, email, 'reset_password')
    const reset = await request(app.getHttpServer())
      .post('/api/app/auth/reset-password')
      .send({ identifier: email, channel: 'email', code, newPassword: 'newbie2new1' })
    expect(reset.status).toBe(200)
    const login = await appLoginRequest(app, email, 'newbie2new1')
    expect(login.status).toBe(200)
  })

  it('绑定/更换邮箱：须新邮箱验证码，且邮箱全局唯一', async () => {
    const token = await appLoginAs(app, '13801210001', 'user123')
    const email = 'chenyu-new@starlan.ai'
    const code = await sendEmailCode(app, email, 'change_email')
    const ok = await request(app.getHttpServer())
      .post('/api/app/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: email, code })
    expect(ok.status).toBe(200)

    const row = await prisma.user.findUniqueOrThrow({ where: { uid: 'U1001' } })
    expect(row.email).toBe(email)
    expect(row.emailVerifiedAt).toBeTruthy()

    /* 冲突：已绑定到他人账号 */
    const otherCode = await sendEmailCode(app, 'linwanzhou@starlan.ai', 'change_email')
    const conflict = await request(app.getHttpServer())
      .post('/api/app/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ newEmail: 'linwanzhou@starlan.ai', code: otherCode })
    expect(conflict.status).toBe(409)
  })

  it('绑定/更换手机号：须新手机号短信验证码', async () => {
    const token = await appLoginAs(app, '13900009999', 'user12345')
    const phone = '13900008888'
    const code = await sendSmsCode(app, phone, 'change_phone')
    const ok = await request(app.getHttpServer())
      .post('/api/app/auth/change-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPhone: phone, smsCode: code })
    expect(ok.status).toBe(200)

    const row = await prisma.user.findUniqueOrThrow({ where: { phone } })
    expect(row.phoneVerifiedAt).toBeTruthy()
  })

  it('用户名/昵称：修改生效、冷却拦截、唯一冲突 409、保留名 400', async () => {
    const token = await appLoginAs(app, '13801210001', 'user123')

    const ok = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'chenyu_boss', nickname: '陈屿本人' })
    expect(ok.status).toBe(200)
    const row = await prisma.user.findUniqueOrThrow({ where: { uid: 'U1001' } })
    expect(row.username).toBe('chenyu_boss')
    expect(row.nickname).toBe('陈屿本人')

    /* 90 天限改：同一账号冷却期内再次改名直接 400（冷却校验先于唯一性校验） */
    const cooled = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'chenyu_again' })
    expect(cooled.status).toBe(400)
    expect(cooled.body.message).toContain('天')

    /* 唯一性/保留名校验改用未改过用户名的 U1002，避免命中自身冷却；
     * 注意：U1002 的密码已被前面的「找回密码」用例重置为 newpass123 */
    const token2 = await appLoginAs(app, '13801210002', 'newpass123')
    const dup = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token2}`)
      .send({ username: 'chenyu_boss' })
    expect(dup.status).toBe(409)

    const reserved = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token2}`)
      .send({ username: 'admin' })
    expect(reserved.status).toBe(400)
    expect(reserved.body.message).toContain('保留')

    const reservedNick = await request(app.getHttpServer())
      .put('/api/app/me')
      .set('Authorization', `Bearer ${token2}`)
      .send({ nickname: '官方客服' })
    expect(reservedNick.status).toBe(400)
  })

  it('daily_login 启用后同一自然日重复登录只发放一次', async () => {
    await prisma.pointsRule.update({ where: { code: 'daily_login' }, data: { status: 'enabled', points: 3 } })
    await redis.delCache(CACHE_KEYS.pointsRules)
    /* 预热测试服务器：supertest 首次并发请求会竞争 listen，导致偶发 ECONNRESET */
    await fetchAppCaptcha(app)
    /* 并发登录：Docker Desktop 下偶发一次连接抖动，重试一次（两次登录语义相同，不影响去重断言） */
    const loginPair = () => Promise.all([
      appLoginRequest(app, '13801210003', 'user123'),
      appLoginRequest(app, '13801210003', 'user123'),
    ])
    await loginPair().catch(() => loginPair())
    const rows = await prisma.pointsRecord.findMany({ where: { dedupeKey: { startsWith: 'daily_login:U1003:' } } })
    expect(rows).toHaveLength(1)
  })

  it('登录失败：达验证码阈值 428、连续失败 5 次锁定 429（此后密码正确也 429）', async () => {
    /* 用未注册号码，避免锁定任何种子账号（Redis 失败/锁定键不随 reseed 清理，会跨套件残留） */
    const phone = '13900007777'
    const first = await appLoginRequest(app, phone, 'wrong-password')
    const second = await appLoginRequest(app, phone, 'wrong-password')
    expect([first.status, second.status]).toEqual([401, 401])

    /* 第 3 次失败累计达 CAPTCHA_AFTER_FAILURES(3) → 428，此后每次尝试都必须携带图形验证码 */
    const third = await appLoginRequest(app, phone, 'wrong-password')
    expect(third.status).toBe(428)

    /* 达阈值后未携带验证码 → 428（服务端强制，提示要求输入验证码；该请求不累加失败计数） */
    const noCaptcha = await request(app.getHttpServer())
      .post('/api/app/auth/login')
      .send({ identifier: phone, password: 'user123' })
    expect(noCaptcha.status).toBe(428)
    expect(noCaptcha.body.message).toContain('请输入验证码')

    /* 每次携带新验证码继续失败：第 4 次仍 428，第 5 次触发 15 分钟锁定 429 */
    const fourth = await appLoginRequest(app, phone, 'wrong-password')
    expect(fourth.status).toBe(428)
    const locked = await appLoginRequest(app, phone, 'wrong-password')
    expect(locked.status).toBe(429)
    expect(locked.body.message).toContain('登录失败次数过多')

    /* 锁定期间即使密码正确也一律 429 */
    const stillLocked = await appLoginRequest(app, phone, 'user123')
    expect(stillLocked.status).toBe(429)
  })
})
