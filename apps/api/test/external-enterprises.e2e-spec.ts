/* M1-B 验收：合作企业聚合视图（wiki-backend.md §7.4）+ M1.5 CRUD（新增/编辑/停用/删除 + 成员增删）
 * 前置：docker compose up + prisma migrate + seed（XE7001+ 档案存在） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-B 合作企业（external-enterprises）', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()

    token = await loginAs(app)
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

  it('GET /api/admin/external-enterprises/:id 不存在返回 404「合作企业不存在」', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE9999')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ code: 404, message: '合作企业不存在' })
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

  /* ---------- M1.5 CRUD / 成员 ---------- */

  it('POST /api/admin/external-enterprises 新增（XE 前缀、合作 0、当月首次合作）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/external-enterprises')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试合作方', industry: '综合', size: '10人以下', foundedAt: '2023-05' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.id).toMatch(/^XE\d+$/)

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/external-enterprises/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.status).toBe('active')
    expect(detail.body.data.cooperationCount).toBe(0)
  })

  it('PUT /api/admin/external-enterprises/:id 编辑档案基本信息', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/external-enterprises/XE7003')
      .set('Authorization', `Bearer ${token}`)
      .send({ size: '50-100人', foundedAt: '2022-01' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7003')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.size).toBe('50-100人')
    expect(detail.body.data.foundedAt).toBe('2022-01')
  })

  it('POST /:id/members 新增成员 / 重复绑定返回 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/external-enterprises/XE7003/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'U1001', title: '外部顾问' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const dup = await request(app.getHttpServer())
      .post('/api/admin/external-enterprises/XE7003/members')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'U1001' })
    expect(dup.status).toBe(409)
    expect(dup.body.message).toBe('该成员已绑定该合作企业')
  })

  it('DELETE /:id/members/:userId 删除成员', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/admin/external-enterprises/XE7003/members/U1001')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7003')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.members.some((m: { userId: string }) => m.userId === 'U1001')).toBe(false)
  })

  it('POST /:id/disable 停用后 status=disabled 且列表可按状态过滤', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/external-enterprises/XE7003/disable')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7003')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.status).toBe('disabled')

    const list = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises?page=1&pageSize=10&status=disabled')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data.list.some((e: { id: string }) => e.id === 'XE7003')).toBe(true)
  })

  it('POST /:id/enable 启用后恢复 active', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/external-enterprises/XE7003/enable')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7003')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.status).toBe('active')
  })

  it('DELETE /api/admin/external-enterprises/:id 归档（含成员）：列表不可见、回收站可见、恢复后回归', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/admin/external-enterprises/XE7001')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const list = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises?page=1&pageSize=50')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data.list.some((e: { id: string }) => e.id === 'XE7001')).toBe(false)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7001')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.status).toBe(404)
    expect(detail.body).toEqual({ code: 404, message: '合作企业不存在' })

    const trash = await request(app.getHttpServer())
      .get('/api/admin/trash?page=1&pageSize=50&domain=externalEnterprise')
      .set('Authorization', `Bearer ${token}`)
    const item = (
      trash.body.data.list as Array<{ id: string; domainLabel: string }>
    ).find((t) => t.id === 'XE7001')
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('合作企业')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/externalEnterprise/XE7001/restore')
      .set('Authorization', `Bearer ${token}`)
    expect(restore.status).toBe(200)
    expect(restore.body).toEqual({ code: 0, data: { code: 0 } })

    const back = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises/XE7001')
      .set('Authorization', `Bearer ${token}`)
    expect(back.status).toBe(200)
    expect(back.body.data.id).toBe('XE7001')
  })
})
