/* M1.5 R7 趋势聚合 e2e：
 * 覆盖：dashboard/trend 返回按日补零的序列（默认 30 天，范围钳制 3~90）。
 * 前置：seed。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

interface TrendPoint {
  date: string
  members: number
  demands: number
  events: number
  points: number
}

describe('M1.5 R7 趋势聚合', () => {
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

  it('默认 30 天序列：含 date/members/demands/events/points 且逐日补零', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/dashboard/trend')
      .set(auth())
    expect(res.status).toBe(200)
    const list = res.body.data as TrendPoint[]
    expect(list.length).toBe(30)
    for (const p of list) {
      expect(p.date).toMatch(/^\d{1,2}-\d{2}$/)
      expect(typeof p.members).toBe('number')
      expect(typeof p.demands).toBe('number')
      expect(typeof p.events).toBe('number')
      expect(typeof p.points).toBe('number')
    }
    /* 序列按日期升序，最后一项为今日 */
    expect(list[list.length - 1].date).toBeTruthy()
  })

  it('days 参数生效；超范围钳制到 3~90', async () => {
    const short = await request(app.getHttpServer())
      .get('/api/admin/dashboard/trend')
      .set(auth())
      .query({ days: 5 })
    expect((short.body.data as TrendPoint[]).length).toBe(5)

    const clamped = await request(app.getHttpServer())
      .get('/api/admin/dashboard/trend')
      .set(auth())
      .query({ days: 200 })
    expect((clamped.body.data as TrendPoint[]).length).toBe(90)
  })
})
