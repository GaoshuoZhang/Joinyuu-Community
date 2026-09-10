/* M1-B 验收：社区企业域（wiki-backend.md §7.3）
 * 前置：docker compose up + prisma migrate + seed（E2001+ 企业存在） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-B 社区企业（enterprises）', () => {
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

  it('GET /api/admin/enterprises 返回包络列表 { list, total }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/enterprises?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
    expect(res.body.data.total).toBeGreaterThanOrEqual(9)
  })

  it('GET /api/admin/enterprises 关键词按名称筛选', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/admin/enterprises?page=1&pageSize=10&keyword=${encodeURIComponent('星澜')}`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.body.code).toBe(0)
    expect(res.body.data.list.length).toBeGreaterThan(0)
    expect(res.body.data.list[0].name).toBe('星澜智能科技')
  })

  it('GET /api/admin/enterprises/options 返回 [{ label, value }]', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/enterprises/options')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({ label: expect.any(String), value: expect.any(String) }),
    )
  })

  it('GET /api/admin/enterprises/:id 详情含派生成员列表', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2001')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data.enterprise.id).toBe('E2001')
    expect(Array.isArray(res.body.data.members)).toBe(true)
    expect(res.body.data.members.length).toBeGreaterThan(0)
    const member = res.body.data.members[0]
    expect(member).toEqual(expect.objectContaining({ uid: expect.any(String), nickname: expect.any(String) }))
    expect(Array.isArray(member.identities)).toBe(true)
  })

  it('GET /api/admin/enterprises/:id 不存在返回 404「企业不存在」', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E9999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ code: 404, message: '企业不存在' })
  })

  it('GET /api/admin/enterprises/:id/stats 返回需求发布量与项目承接量', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2001/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(
      expect.objectContaining({ demandCount: expect.any(Number), projectCount: expect.any(Number) }),
    )
  })

  it('PATCH showcase-status 驳回缺原因返回 400「请填写驳回原因」', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/admin/enterprises/E2001/showcase-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'rejected' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('请填写驳回原因')
  })

  it('PATCH showcase-status 审核流转（pending → published → 恢复 pending）', async () => {
    const publish = await request(app.getHttpServer())
      .patch('/api/admin/enterprises/E2004/showcase-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'published' })
    expect(publish.status).toBe(200)
    expect(publish.body).toEqual({ code: 0, data: { code: 0 } })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2004')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enterprise.showcaseStatus).toBe('published')

    const restore = await request(app.getHttpServer())
      .patch('/api/admin/enterprises/E2004/showcase-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending' })
    expect(restore.status).toBe(200)
  })
})
