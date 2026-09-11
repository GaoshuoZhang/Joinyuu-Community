/* M1-B 验收：社区企业域（wiki-backend.md §7.3）+ M1.5 CRUD（新增/编辑/停用/删除）
 * 前置：docker compose up + prisma migrate + seed（E2001+ 企业存在） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-B 社区企业（enterprises）', () => {
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

  /* ---------- M1.5 CRUD ---------- */

  it('POST /api/admin/enterprises 新增企业（E 前缀、正常态、展示页未提交）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/enterprises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '测试新增科技',
        industry: '人工智能',
        size: '10-50人',
        leaseType: '独立办公室',
        contactUserId: 'U1002',
        contactTitle: 'CTO',
        foundedAt: '2024-01',
      })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.id).toMatch(/^E\d+$/)

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/enterprises/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enterprise.status).toBe('active')
    expect(detail.body.data.enterprise.showcaseStatus).toBe('none')
    expect(detail.body.data.enterprise.name).toBe('测试新增科技')
    /* 关联用户必填：联系人姓名/联系电话由该用户派生（U1002 林晚舟） */
    expect(detail.body.data.enterprise.contactUserId).toBe('U1002')
    expect(detail.body.data.enterprise.contactTitle).toBe('CTO')
    expect(detail.body.data.enterprise.contactName).toBe('林晚舟')
    /* 联系人即成员：详情「成员管理」应包含该用户，职位同步 */
    const member = detail.body.data.members.find((m: { uid: string }) => m.uid === 'U1002')
    expect(member).toBeDefined()
    const identity = member.identities.find(
      (i: { type: string; enterpriseId?: string }) =>
        i.type === 'community_enterprise' && i.enterpriseId === res.body.data.id,
    )
    expect(identity.title).toBe('CTO')
  })

  it('POST /api/admin/enterprises 缺关联用户返回 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/enterprises')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '缺关联用户企业',
        industry: '综合',
        size: '10人以下',
        leaseType: '开放办公位',
      })
    expect(res.status).toBe(400)
  })

  it('PUT /api/admin/enterprises/:id 编辑企业基本信息', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/admin/enterprises/E2009')
      .set('Authorization', `Bearer ${token}`)
      .send({ size: '50-100人', contactName: '新联系人' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2009')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enterprise.size).toBe('50-100人')
    expect(detail.body.data.enterprise.contactName).toBe('新联系人')
  })

  it('POST /api/admin/enterprises/:id/disable 停用后列表状态为 disabled', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/enterprises/E2009/disable')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2009')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enterprise.status).toBe('disabled')

    const list = await request(app.getHttpServer())
      .get('/api/admin/enterprises?page=1&pageSize=10&status=disabled')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data.list.some((e: { id: string }) => e.id === 'E2009')).toBe(true)
  })

  it('POST /api/admin/enterprises/:id/enable 启用后恢复 active', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/enterprises/E2009/enable')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2009')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.enterprise.status).toBe('active')
  })

  it('DELETE /api/admin/enterprises/:id 归档：列表不可见、回收站可见、恢复后回归', async () => {
    /* E2003 无进行中租约，可直接归档 */
    const res = await request(app.getHttpServer())
      .delete('/api/admin/enterprises/E2003')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)

    const list = await request(app.getHttpServer())
      .get('/api/admin/enterprises?page=1&pageSize=50&keyword=E2003')
      .set('Authorization', `Bearer ${token}`)
    expect(list.body.data.list.some((e: { id: string }) => e.id === 'E2003')).toBe(false)

    const detail = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2003')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.status).toBe(404)
    expect(detail.body).toEqual({ code: 404, message: '企业不存在' })

    const trash = await request(app.getHttpServer())
      .get('/api/admin/trash?page=1&pageSize=50&domain=enterprise')
      .set('Authorization', `Bearer ${token}`)
    const item = (trash.body.data.list as Array<{ id: string; domainLabel: string }>).find(
      (t) => t.id === 'E2003',
    )
    expect(item).toBeTruthy()
    expect(item?.domainLabel).toBe('社区企业')

    const restore = await request(app.getHttpServer())
      .post('/api/admin/trash/enterprise/E2003/restore')
      .set('Authorization', `Bearer ${token}`)
    expect(restore.status).toBe(200)
    expect(restore.body).toEqual({ code: 0, data: { code: 0 } })

    const back = await request(app.getHttpServer())
      .get('/api/admin/enterprises/E2003')
      .set('Authorization', `Bearer ${token}`)
    expect(back.status).toBe(200)
    expect(back.body.data.enterprise.id).toBe('E2003')
  })
})
