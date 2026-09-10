/* M1-B 验收（wiki-backend.md §13 M1-B）：
 * 审批通过入驻申请 → 200 + 企业/身份经后续列表与账本可见（首绑积分/经验发放）。
 * 前置：docker compose up + prisma migrate + seed（含 AP3012 拾光文创 待审批 / U1006 沈嘉禾 / E2003 拾光文创 pending
 *       与积分/经验规则 identity_first_bind enabled） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-B applications 审批（approve 授予身份）', () => {
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

  it('审批通过入驻申请 → 200 且企业/身份经账本可见', async () => {
    // AP3012 拾光文创：申请人沈嘉禾（U1006），企业 E2003 已存在且 status=pending
    const res = await request(app.getHttpServer())
      .post('/api/admin/applications/AP3012/approve')
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: '材料齐全' })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data).toEqual({ code: 0 })

    // 申请列表按 status=approved 可见
    const list = await request(app.getHttpServer())
      .get('/api/admin/applications')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 50, status: 'approved' })
    expect(list.status).toBe(200)
    expect(list.body.code).toBe(0)
    const appRow = list.body.data.list.find((a: { id: string }) => a.id === 'AP3012')
    expect(appRow.status).toBe('approved')

    // 身份绑定触发企业经验账本（E2003 新增 rule 流水）
    const exp = await request(app.getHttpServer())
      .get('/api/admin/experience-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ targetType: 'enterprise', targetId: 'E2003' })
    expect(exp.status).toBe(200)
    expect(exp.body.code).toBe(0)
    expect(exp.body.data.some((r: { source: string }) => r.source === 'rule')).toBe(true)

    // 身份绑定触发用户积分账本（U1006 新增 rule 流水）
    const pts = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'U1006' })
    expect(pts.status).toBe(200)
    expect(pts.body.code).toBe(0)
    expect(pts.body.data.some((r: { source: string }) => r.source === 'rule')).toBe(true)
  })
})
