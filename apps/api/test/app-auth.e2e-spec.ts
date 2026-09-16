/* M2-R R1 验收：app 鉴权（注册/登录/登出/找回密码）+ 路径分流（app 令牌不可访问 admin；admin 令牌不可访问 app）
 * 前置：docker compose up + prisma migrate + seed（用户统一密码 user123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
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
  })

  afterAll(async () => {
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

  it('错误密码登录返回 401 与可展示文案', async () => {
    const res = await appLoginRequest(app, '13801210001', 'wrong-password')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ code: 401, message: '手机号或密码错误' })
  })

  it('缺验证码登录返回 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/app/auth/login')
      .send({ phone: '13801210001', password: 'user123' })
    expect(res.status).toBe(400)
  })

  it('成功登录返回 token（含身份摘要）', async () => {
    const res = await appLoginRequest(app, '13801210001', 'user123')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(typeof res.body.data.token).toBe('string')
    expect(res.body.data.uid).toBe('U1001')
    expect(res.body.data.name).toBe('陈屿')
    expect(Array.isArray(res.body.data.identities)).toBe(true)
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

  it('注册：未同意协议 400 / 已存在手机号 409', async () => {
    const { captchaId, captchaCode } = await fetchAppCaptcha(app)
    const noAgree = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({
        phone: '13900000001',
        password: 'user12345',
        nickname: '新居民',
        captchaId,
        captchaCode,
      })
    expect(noAgree.status).toBe(400)
    expect(noAgree.body.message).toContain('请先阅读并同意')

    const dup = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({
        phone: '13801210001',
        password: 'user12345',
        nickname: '重复号',
        agreed: true,
        captchaId,
        captchaCode,
      })
    expect(dup.status).toBe(409)
  })

  it('注册必须使用有效且一次性的图形验证码', async () => {
    const invalid = await request(app.getHttpServer()).post('/api/app/auth/register').send({
      phone: '13900000002', password: 'user12345', nickname: '无验证码', agreed: true,
      captchaId: 'missing', captchaCode: 'AAAA',
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body.message).toContain('验证码')
  })

  it('注册成功（agreed=true）后可用新账号登录', async () => {
    const { captchaId, captchaCode } = await fetchAppCaptcha(app)
    const reg = await request(app.getHttpServer())
      .post('/api/app/auth/register')
      .send({
        phone: '13900009999',
        password: 'user12345',
        nickname: '周师傅',
        agreed: true,
        captchaId,
        captchaCode,
      })
    expect(reg.status).toBe(200)
    expect(reg.body.data.uid).toBeTruthy()
    const consents = await prisma.agreementConsent.findMany({ where: { userId: reg.body.data.uid } })
    expect(consents.map((item) => item.agreementType).sort()).toEqual(['privacy_policy', 'user_agreement'])

    const login = await appLoginRequest(app, '13900009999', 'user12345')
    expect(login.status).toBe(200)
    expect(login.body.data.name).toBe('周师傅')
  })

  it('找回密码（图形验证码降级）后可新密码登录', async () => {
    const { captchaId, captchaCode } = await fetchAppCaptcha(app)
    const reset = await request(app.getHttpServer())
      .post('/api/app/auth/reset-password')
      .send({
        phone: '13801210002',
        captchaId,
        captchaCode,
        newPassword: 'newpass123',
      })
    expect(reset.status).toBe(200)
    expect(reset.body.code).toBe(0)

    const oldPass = await appLoginRequest(app, '13801210002', 'user123')
    expect(oldPass.status).toBe(401)
    const newPass = await appLoginRequest(app, '13801210002', 'newpass123')
    expect(newPass.status).toBe(200)
  })

  it('daily_login 启用后同一自然日重复登录只发放一次', async () => {
    await prisma.pointsRule.update({ where: { code: 'daily_login' }, data: { status: 'enabled', points: 3 } })
    await redis.delCache(CACHE_KEYS.pointsRules)
    await Promise.all([
      appLoginRequest(app, '13801210003', 'user123'),
      appLoginRequest(app, '13801210003', 'user123'),
    ])
    const rows = await prisma.pointsRecord.findMany({ where: { dedupeKey: { startsWith: 'daily_login:U1003:' } } })
    expect(rows).toHaveLength(1)
  })
})
