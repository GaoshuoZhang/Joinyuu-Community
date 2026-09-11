/* M1-A 验收冒烟（wiki-backend.md §13 M1-A）：
 * login → 携带 token 访问受保护端点 → logout → 原 token 401（Redis 黑名单生效）
 * 前置：docker compose up（postgres/redis）+ prisma migrate + seed（admin/admin123） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginRequest } from './helpers/login'

describe('M1-A 冒烟（auth + health）', () => {
  let app: INestApplication

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('健康检查无需登录，返回包络 { code: 0, data }', async () => {
    const res = await request(app.getHttpServer()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ code: 0, data: { status: 'ok' } })
  })

  it('未携带 token 访问受保护端点返回 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/admin/auth/logout')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe(401)
    expect(res.body.message).toBeTruthy()
  })

  it('错误密码登录返回 401 与可展示文案', async () => {
    const res = await loginRequest(app, 'admin', 'wrong-password')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ code: 401, message: '账号或密码错误，请重新输入' })
  })

  it('缺字段登录返回 400（校验管道）', async () => {
    const res = await request(app.getHttpServer()).post('/api/admin/auth/login').send({ username: 'admin' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe(400)
    expect(res.body.message).toContain('请输入密码')
  })

  it('正确登录 → 登出 → 原 token 失效 401（黑名单生效）', async () => {
    const login = await loginRequest(app, 'admin', 'admin123')
    expect(login.status).toBe(200)
    expect(login.body.code).toBe(0)
    expect(typeof login.body.data.token).toBe('string')
    expect(login.body.data.name).toBe('社区管理员')
    const token: string = login.body.data.token

    const logout = await request(app.getHttpServer())
      .post('/api/admin/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(logout.status).toBe(200)
    expect(logout.body).toEqual({ code: 0, data: { code: 0 } })

    const revoked = await request(app.getHttpServer())
      .post('/api/admin/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(revoked.status).toBe(401)
    expect(revoked.body.code).toBe(401)
  })
})
