/* M1.5 验收（四类申请审核，2026-09-11 扩展）：
 *   settle      企业入驻申请 → 新增社区企业 + 申请人社区企业身份
 *   individual  个体入驻申请 → 新增社区个体（community_individual 身份）
 *   cooperation 企业合作申请 → 新增合作企业档案 + 申请人合作企业身份
 *   identity    身份绑定申请 → 目标企业属社区企业/合作企业则挂成员；否则自动新增合作企业
 * 首绑均触发 identity_first_bind 积分/经验值发放。
 * 前置：docker compose up + prisma migrate + seed（AP3012/AP3017/AP3018/AP3019/AP3014 等待审核） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1.5 applications 四类申请审核', () => {
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

  const auth = () => ({ Authorization: `Bearer ${token}` })

  async function approve(id: string) {
    const res = await request(app.getHttpServer())
      .post(`/api/admin/applications/${id}/approve`)
      .set(auth())
      .send({ comment: '材料齐全' })
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
  }

  it('企业入驻：通过后按申请表单新增社区企业 + 申请人身份与经验值', async () => {
    await approve('AP3012')

    const list = await request(app.getHttpServer())
      .get('/api/admin/applications')
      .set(auth())
      .query({ page: 1, pageSize: 50, status: 'approved' })
    expect(list.status).toBe(200)
    expect(list.body.data.list.find((a: { id: string }) => a.id === 'AP3012').status).toBe('approved')

    const entList = await request(app.getHttpServer())
      .get('/api/admin/enterprises')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: '木棉文创社' })
    expect(entList.status).toBe(200)
    const ent = entList.body.data.list[0]
    expect(ent?.name).toBe('木棉文创社')
    expect(ent.status).toBe('active')

    const exp = await request(app.getHttpServer())
      .get('/api/admin/experience-records')
      .set(auth())
      .query({ targetType: 'enterprise', targetId: ent.id })
    expect(exp.status).toBe(200)
    expect(exp.body.data.some((r: { source: string }) => r.source === 'rule')).toBe(true)

    const pts = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set(auth())
      .query({ userId: 'U1006' })
    expect(pts.status).toBe(200)
    expect(pts.body.data.some((r: { source: string }) => r.source === 'rule')).toBe(true)
  })

  it('个体入驻：通过后新增社区个体（community_individual 身份）', async () => {
    await approve('AP3018')

    const res = await request(app.getHttpServer())
      .get('/api/admin/individuals')
      .set(auth())
      .query({ page: 1, pageSize: 50 })
    expect(res.status).toBe(200)
    expect(res.body.data.list.some((u: { uid: string }) => u.uid === 'U1009')).toBe(true)
  })

  it('企业合作：通过后新增合作企业档案 + 申请人挂靠为成员', async () => {
    await approve('AP3017')

    const list = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: '云图数据' })
    expect(list.status).toBe(200)
    const profile = list.body.data.list.find((p: { name: string }) => p.name === '云图数据')
    expect(profile).toBeTruthy()

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/external-enterprises/${profile.id}`)
      .set(auth())
    expect(detail.status).toBe(200)
    expect(detail.body.data.members.some((m: { userId: string }) => m.userId === 'U1004')).toBe(true)
  })

  it('身份绑定（目标为社区企业）：挂到该社区企业成员名单', async () => {
    await approve('AP3014')

    const detail = await request(app.getHttpServer()).get('/api/admin/enterprises/E2002').set(auth())
    expect(detail.status).toBe(200)
    expect(detail.body.data.members.some((m: { uid: string }) => m.uid === 'U1009')).toBe(true)
  })

  it('身份绑定（目标不在社区企业/合作企业名单）：自动新增合作企业并挂靠成员', async () => {
    await approve('AP3019')

    const list = await request(app.getHttpServer())
      .get('/api/admin/external-enterprises')
      .set(auth())
      .query({ page: 1, pageSize: 50, keyword: '星环科技' })
    expect(list.status).toBe(200)
    const profile = list.body.data.list.find((p: { name: string }) => p.name === '星环科技')
    expect(profile).toBeTruthy()

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/external-enterprises/${profile.id}`)
      .set(auth())
    expect(detail.status).toBe(200)
    expect(detail.body.data.members.some((m: { userId: string }) => m.userId === 'U1013')).toBe(true)
  })
})
