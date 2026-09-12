/* M1.5 R3 登录安全 + R8 登录日志 e2e：
 * 覆盖：图形验证码（错/对/未携带强制 400）、在线会话列表与强踢（黑名单 401）、
 *       修改密码（原密码校验 + 改密后旧 token 失效）、登录日志写入与筛选、
 *       密码周期（过期标记 + 守卫白名单）、验证码接口 IP 限流。
 * 前置：seed 账号 admin/operator（密码 admin123）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from 'bcryptjs'
import Redis from 'ioredis'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { formatNow } from '../src/common/utils/time'
import { reseed } from './helpers/reseed'
import { decodeCaptcha, loginAs, loginRequest } from './helpers/login'

describe('M1.5 R3 登录安全 / R8 登录日志', () => {
  let app: INestApplication
  let adminToken: string
  let operatorToken: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    /* 验证码限流用例会让本机 IP 在 60s 内受限，且限流键不随 reseed 清理：
     * 结束前清空，避免影响后续套件的登录（验证码）请求 */
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    })
    try {
      const keys = await redis.keys('auth:captcha:rate:*')
      if (keys.length > 0) await redis.del(...keys)
    } catch {
      /* Redis 不可用时忽略（其他断言仍以真实行为为准） */
    } finally {
      redis.disconnect()
    }
    await app.close()
  })

  it('验证码：错误验证码 400；正确验证码登录成功', async () => {
    const captcha = await request(app.getHttpServer()).get('/api/admin/auth/captcha')
    expect(captcha.status).toBe(200)
    expect(captcha.body.data.captchaId).toBeTruthy()
    expect(captcha.body.data.image.startsWith('data:image/svg+xml')).toBe(true)

    const wrong = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123', captchaId: captcha.body.data.captchaId, captchaCode: 'ZZZZ' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.message).toBe('验证码错误或已过期')

    const fresh = await request(app.getHttpServer()).get('/api/admin/auth/captcha')
    const code = decodeCaptcha(fresh.body.data.image)
    const ok = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123', captchaId: fresh.body.data.captchaId, captchaCode: code })
    expect(ok.status).toBe(200)
    adminToken = ok.body.data.token
    expect(ok.body.data.permissions).toEqual(['*'])
  })

  it('未携带验证码登录 → 400（服务端强制）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: 'operator', password: 'admin123' })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('请先获取验证码')

    operatorToken = await loginAs(app, 'operator')
  })

  it('登录失败写入日志（密码错误）', async () => {
    const res = await loginRequest(app, 'operator', 'wrong-pass')
    expect(res.status).toBe(401)
  })

  it('连续失败 5 次触发锁定：第 6 次登录 429（登录失败次数过多）', async () => {
    /* 用不存在的唯一账号做锁定验证：避免污染 admin/operator，且不受历史 Redis 锁定键影响 */
    const username = `nobody-${Date.now()}`
    for (let i = 0; i < 5; i++) {
      const res = await loginRequest(app, username, 'wrong-pass')
      expect(res.status).toBe(401)
    }
    const locked = await loginRequest(app, username, 'wrong-pass')
    expect(locked.status).toBe(429)
    expect(locked.body.message).toContain('登录失败次数过多')
  })

  it('在线会话列表 + 强制下线（黑名单后旧 token 401）', async () => {
    const sessions = await request(app.getHttpServer())
      .get('/api/admin/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(sessions.status).toBe(200)
    const operatorSession = (sessions.body.data as Array<{ jti: string; username: string }>).find(
      (s) => s.username === 'operator',
    )
    expect(operatorSession).toBeTruthy()

    const kick = await request(app.getHttpServer())
      .post(`/api/admin/auth/sessions/${operatorSession!.jti}/kick`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(kick.status).toBe(200)

    const after = await request(app.getHttpServer())
      .get('/api/admin/auth/sessions')
      .set('Authorization', `Bearer ${operatorToken}`)
    expect(after.status).toBe(401)
  })

  it('一键强制下线：下线其余全部会话并保留当前会话', async () => {
    /* 上一用例已踢除 operator；补一个新会话验证批量下线 */
    const auditorToken = await loginAs(app, 'auditor')

    const kickAll = await request(app.getHttpServer())
      .post('/api/admin/auth/sessions/kick-all')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(kickAll.status).toBe(200)
    expect((kickAll.body.data as { kicked: number }).kicked).toBeGreaterThanOrEqual(1)

    /* 其余会话已失效 */
    const auditorAfter = await request(app.getHttpServer())
      .get('/api/admin/auth/sessions')
      .set('Authorization', `Bearer ${auditorToken}`)
    expect(auditorAfter.status).toBe(401)

    /* 当前会话保留 */
    const selfAfter = await request(app.getHttpServer())
      .get('/api/admin/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(selfAfter.status).toBe(200)
  })

  it('登录日志：写入成功/失败记录并支持筛选', async () => {
    const all = await request(app.getHttpServer())
      .get('/api/admin/login-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, pageSize: 50 })
    expect(all.status).toBe(200)
    expect(all.body.data.total).toBeGreaterThan(0)

    const success = await request(app.getHttpServer())
      .get('/api/admin/login-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, pageSize: 50, status: 'success' })
    expect(success.body.data.list.length).toBeGreaterThan(0)
    expect(
      (success.body.data.list as Array<{ status: string }>).every((l) => l.status === 'success'),
    ).toBe(true)

    const failed = await request(app.getHttpServer())
      .get('/api/admin/login-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, pageSize: 50, status: 'failed' })
    const reasons = (failed.body.data.list as Array<{ failedReason?: string }>).map((l) => l.failedReason)
    expect(reasons).toContain('账号或密码错误')

    const byKeyword = await request(app.getHttpServer())
      .get('/api/admin/login-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, pageSize: 50, keyword: 'admin' })
    expect(byKeyword.body.data.list.length).toBeGreaterThan(0)
  })

  it('修改密码：原密码错误 400；改密后旧 token 失效，新密码可登录', async () => {
    const wrong = await request(app.getHttpServer())
      .post('/api/admin/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ oldPassword: 'nope1234', newPassword: 'admin1234' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.message).toBe('原密码不正确')

    const ok = await request(app.getHttpServer())
      .post('/api/admin/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ oldPassword: 'admin123', newPassword: 'admin1234' })
    expect(ok.status).toBe(200)

    const oldToken = await request(app.getHttpServer())
      .get('/api/admin/auth/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(oldToken.status).toBe(401)

    const relogin = await loginRequest(app, 'admin', 'admin1234')
    expect(relogin.status).toBe(200)
  })

  it('密码周期：过期登录带 passwordExpired，受限接口 403，改密后解除', async () => {
    const prisma = app.get(PrismaService)

    /* 上一用例已把 admin 密码改为 admin1234 且旧 token 被黑名单：先恢复初始密码取得有效 token */
    await prisma.adminUser.update({
      where: { username: 'admin' },
      data: { passwordHash: await hash('admin123', 10), passwordUpdatedAt: formatNow() },
    })
    const adminToken = await loginAs(app, 'admin', 'admin123')

    /* 制造过期：时间戳回拨至 2020-01-01 + 有效期 1 天（用仍有效的 token 保存配置） */
    await prisma.adminUser.update({
      where: { username: 'admin' },
      data: { passwordUpdatedAt: '2020-01-01 10:00' },
    })
    const config = (
      await request(app.getHttpServer())
        .get('/api/admin/system/config')
        .set('Authorization', `Bearer ${adminToken}`)
    ).body.data as Record<string, unknown>
    const saved = await request(app.getHttpServer())
      .put('/api/admin/system/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...config, passwordExpireDays: 1 })
    expect(saved.status).toBe(200)

    /* 过期登录：仍成功但标记 passwordExpired；受保护接口被 JWT 守卫拦截 403 */
    const expired = await loginRequest(app, 'admin', 'admin123')
    expect(expired.status).toBe(200)
    expect(expired.body.data.passwordExpired).toBe(true)
    const expiredToken = expired.body.data.token as string

    const blocked = await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${expiredToken}`)
    expect(blocked.status).toBe(403)
    expect(blocked.body.message).toBe('密码已过期，请先修改密码')

    /* 改密接口在白名单内：改密成功清除标记并强制下线 */
    const changed = await request(app.getHttpServer())
      .post('/api/admin/auth/change-password')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ oldPassword: 'admin123', newPassword: 'admin1234' })
    expect(changed.status).toBe(200)

    const relogin = await loginRequest(app, 'admin', 'admin1234')
    expect(relogin.status).toBe(200)
    expect(relogin.body.data.passwordExpired).toBe(false)
    const fresh = await request(app.getHttpServer())
      .get('/api/admin/users?page=1&pageSize=5')
      .set('Authorization', `Bearer ${relogin.body.data.token}`)
    expect(fresh.status).toBe(200)

    /* 还原初始密码与配置（直接 prisma），避免影响后续用例 */
    const restorePwd = await request(app.getHttpServer())
      .post('/api/admin/auth/change-password')
      .set('Authorization', `Bearer ${relogin.body.data.token}`)
      .send({ oldPassword: 'admin1234', newPassword: 'admin123' })
    expect(restorePwd.status).toBe(200)
    await prisma.adminUser.update({
      where: { username: 'admin' },
      data: { passwordUpdatedAt: formatNow() },
    })
    await prisma.systemConfig.update({ where: { id: 1 }, data: { passwordExpireDays: 0 } })
  })

  /* 必须放在套件最末：该用例会让本机 IP 在 60s 内触发验证码限流（afterAll 清理限流键） */
  it('验证码限流：同一 IP 60s 内累计超过 30 次返回 429', async () => {
    const responses = []
    for (let i = 0; i < 31; i++) {
      responses.push(await request(app.getHttpServer()).get('/api/admin/auth/captcha'))
    }
    const last = responses[responses.length - 1]
    expect(last.status).toBe(429)
    expect(last.body.message).toBe('操作过于频繁，请稍后重试')
  })
})
