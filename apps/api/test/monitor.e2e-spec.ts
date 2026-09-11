/* M1.5 R6 系统监控 e2e：
 * 覆盖：overview（服务/DB/Redis 健康 + 定时任务最近执行）、手动触发任务落日志、未知任务 404。
 * 前置：docker compose up（Redis）+ seed。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1.5 R6 系统监控', () => {
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

  it('overview：返回服务健康、Redis 概览与定时任务列表', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/monitor/overview')
      .set(auth())
    expect(res.status).toBe(200)
    const data = res.body.data
    expect(['healthy', 'degraded', 'down']).toContain(data.service.status)
    expect(data.service.name).toBe('joinyuu-api')
    expect(data.service.db.status).toBe('up')
    expect(data.service.redis.status).toBe('up')
    expect(Array.isArray(data.jobs)).toBe(true)
    expect(data.jobs.length).toBe(6)
    const names = data.jobs.map((j: { name: string }) => j.name)
    expect(names).toContain('articles-scheduled-publish')
    expect(names).toEqual(
      expect.arrayContaining(['archive-auto-archive', 'archive-auto-purge']),
    )
  })

  it('手动触发任务 → 写入执行日志', async () => {
    const run = await request(app.getHttpServer())
      .post('/api/admin/monitor/jobs/events-auto-end/run')
      .set(auth())
    expect(run.status).toBe(200)
    expect(run.body).toEqual({ code: 0, data: { code: 0 } })

    const logs = await request(app.getHttpServer())
      .get('/api/admin/monitor/cron-logs')
      .set(auth())
      .query({ jobName: 'events-auto-end' })
    expect(logs.status).toBe(200)
    expect(logs.body.data.length).toBeGreaterThan(0)
    expect(logs.body.data[0].result).toBe('success')
  })

  it('未知任务 → 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/monitor/jobs/not-exist/run')
      .set(auth())
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ code: 404, message: '任务不存在' })
  })
})
