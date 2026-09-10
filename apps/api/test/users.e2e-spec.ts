/* M1-B 验收：用户与社区个体域（wiki-backend.md §7.2）
 * 前置：docker compose up + prisma migrate + seed（admin/admin123、U1001+ 用户存在）
 * 注意：冻结→解冻为状态流转回归，末尾恢复 active，避免污染共享种子数据 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-B 用户与社区个体（users / individuals）', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    const login = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({ username: 'admin', password: 'admin123' })
    token = login.body.data.token
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/admin/users 返回包络列表 { list, total }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
    expect(res.body.data.total).toBeGreaterThanOrEqual(15)
  })

  it('GET /api/admin/users 关键词按昵称筛选', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/users?page=1&pageSize=10&keyword=${encodeURIComponent('陈屿')}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(0)
    expect(res.body.data.list.length).toBeGreaterThan(0)
    expect(res.body.data.list[0].nickname).toBe('陈屿')
  })

  it('GET /api/admin/users 状态筛选 frozen', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users?page=1&pageSize=10&status=frozen')
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(0)
    expect(res.body.data.list.every((u: { status: string }) => u.status === 'frozen')).toBe(true)
  })

  it('GET /api/admin/users/:id 详情含实时 stats、identities、activities', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users/U1001')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.uid).toBe('U1001')
    expect(res.body.data.stats).toEqual(
      expect.objectContaining({ demands: expect.any(Number), projects: expect.any(Number), events: expect.any(Number) }),
    )
    expect(Array.isArray(res.body.data.identities)).toBe(true)
    expect(Array.isArray(res.body.data.activities)).toBe(true)
  })

  it('GET /api/admin/users/:id 不存在返回 404「用户不存在」', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users/U9999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ code: 404, message: '用户不存在' })
  })

  it('GET /api/admin/users/options 返回 [{ label, value }]', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/users/options')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ label: expect.any(String), value: expect.any(String) }),
    )
  })

  it('GET /api/admin/individuals 返回社区个体列表', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/individuals?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
  })

  it('POST freeze 已冻结账号返回 409「该账号已处于冻结状态」', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/users/U1014/freeze')
      .set('Authorization', `Bearer ${token}`)
      .send({ permanent: true, reason: 'e2e' })
    expect(res.status).toBe(409)
    expect(res.body.message).toBe('该账号已处于冻结状态')
  })

  it('POST freeze 非长期且未选期限返回 400「请选择冻结期限或开启长期冻结」', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/users/U1015/freeze')
      .set('Authorization', `Bearer ${token}`)
      .send({ permanent: false, reason: 'e2e' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('请选择冻结期限或开启长期冻结')
  })

  it('POST freeze 缺原因返回 400「请填写冻结原因」', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/users/U1015/freeze')
      .set('Authorization', `Bearer ${token}`)
      .send({ permanent: true, reason: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('请填写冻结原因')
  })

  it('冻结 → 解冻 状态流转（长期冻结后恢复 active）', async () => {
    const freeze = await request(app.getHttpServer())
      .post('/api/admin/users/U1015/freeze')
      .set('Authorization', `Bearer ${token}`)
      .send({ permanent: true, reason: 'e2e 测试冻结' })
    expect(freeze.status).toBe(200)
    expect(freeze.body).toEqual({ code: 0, data: { code: 0 } })

    const frozen = await request(app.getHttpServer())
      .get('/api/admin/users/U1015')
      .set('Authorization', `Bearer ${token}`)
    expect(frozen.body.data.status).toBe('frozen')
    expect(frozen.body.data.frozenReason).toBe('e2e 测试冻结')

    const unfreeze = await request(app.getHttpServer())
      .patch('/api/admin/users/U1015/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })
    expect(unfreeze.status).toBe(200)
    expect(unfreeze.body).toEqual({ code: 0, data: { code: 0 } })

    const restored = await request(app.getHttpServer())
      .get('/api/admin/users/U1015')
      .set('Authorization', `Bearer ${token}`)
    expect(restored.body.data.status).toBe('active')
  })
})
