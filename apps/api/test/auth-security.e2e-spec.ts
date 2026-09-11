/* M1.5 R3 登录安全 + R8 登录日志 e2e：
 * 覆盖：图形验证码（错/对/未携带强制 400）、在线会话列表与强踢（黑名单 401）、
 *       修改密码（原密码校验 + 改密后旧 token 失效）、登录日志写入与筛选。
 * 前置：seed 账号 admin/operator（密码 admin123）。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
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
})
