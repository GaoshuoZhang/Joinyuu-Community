/* M1-B 验收：外部企业聚合视图（wiki-backend.md §7.4）
 * 前置：docker compose up + prisma migrate + seed（XE7001+ 档案存在） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-B 外部企业（external-enterprises）', () => {
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

  it('GET /api/admin/external-enterprises 返回包络列表 { list, total }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
    expect(res.body.data.total).toBeGreaterThanOrEqual(3)
  })

  it('GET /api/admin/external-enterprises 关键词筛选命中行业', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/external-enterprises?page=1&pageSize=10&keyword=${encodeURIComponent('风险投资')}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(0)
    expect(res.body.data.list.length).toBeGreaterThan(0)
    expect(res.body.data.list[0].name).toBe('远见资本')
  })

  it('GET /api/admin/external-enterprises 按累计合作正序排序', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises?page=1&pageSize=10&sortBy=cooperationCount&sortOrder=ascend')
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(0)
    const counts = res.body.data.list.map((e: { cooperationCount: number }) => e.cooperationCount)
    expect([...counts].sort((a: number, b: number) => a - b)).toEqual(counts)
  })

  it('GET /api/admin/external-enterprises/:id 详情含派生成员（name=realName‖nickname）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7001')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('XE7001')
    expect(res.body.data.name).toBe('远见资本')
    expect(Array.isArray(res.body.data.members)).toBe(true)
    expect(res.body.data.members.length).toBeGreaterThan(0)
    expect(res.body.data.members[0]).toEqual(
      expect.objectContaining({
        userId: expect.any(String),
        name: expect.any(String),
        title: expect.any(String),
        phone: expect.any(String),
        status: expect.any(String),
      }),
    )
  })

  it('GET /api/admin/external-enterprises/:id 不存在返回 404「外部企业不存在」', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE9999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ code: 404, message: '外部企业不存在' })
  })

  it('GET /api/admin/external-enterprises/:id/stats 返回需求发布量与成员个人承接项目量', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7001/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(
      expect.objectContaining({ demandCount: expect.any(Number), projectCount: expect.any(Number) }),
    )
  })
})
