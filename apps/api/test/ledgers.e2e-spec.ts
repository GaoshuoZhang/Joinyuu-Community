/* M1-B 验收（wiki-backend.md §13 M1-B）：
 * 手动积分调整：扣减致负 → 精确错误文案；+100 → 余额递增且末笔流水 balance 一致。
 * 前置：docker compose up + prisma migrate + seed（含 U1001 陈屿 积分 2710） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'

describe('M1-B ledgers 手动积分调整', () => {
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

  it('扣减积分致余额为负 → 400 精确文案', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'U1001', delta: -999999, reason: '余额不足测试' })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe(400)
    expect(res.body.message).toBe('扣减后积分不能为负')
  })

  it('积分 +100 → 余额递增且末笔流水 balance 一致', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'U1001', delta: 100, reason: '手动调整测试' })

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.code).toBe(0)
    expect(res.body.data.balance).toBeGreaterThanOrEqual(100)

    const records = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'U1001' })
    expect(records.status).toBe(200)
    expect(records.body.code).toBe(0)

    const latest = records.body.data[0]
    expect(latest.delta).toBe(100)
    expect(latest.balance).toBe(res.body.data.balance)
  })
})
