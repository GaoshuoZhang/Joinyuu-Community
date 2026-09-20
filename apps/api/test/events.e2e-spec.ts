/* M1-C 活动模块 e2e（wiki-backend.md §13 M1-C）：
 * 覆盖：发布成功 + 非法流转 409；报名审核通过 → 积分流水；签到 → 积分 + 经验值流水；定时发布扫描 + 自动结束。
 * 前置：docker compose up + prisma migrate + seed（EV6006 待发布 / EV6004 已结束 / EV6001 已发布 enrollPoints=50 含 U1005 待审核 /
 *       EV6002 已发布 checkinPoints=100 含 U1006 待审核 / EV6009 定时发布中 / U1005 顾北辰积分 600 / U1006 沈嘉禾社区个体经验值 200）。
 * 定时任务直接调用 SchedulerService 公开方法（免等 cron），@Cron 仅转发到这些方法。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { SchedulerService } from '../src/scheduler/scheduler.service'

describe('M1-C events 活动（发布/编辑/审核/签到/定时任务）', () => {
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

  it('报名审核：跨活动分页查询返回活动与报名人信息', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/events/enrollments?page=1&pageSize=10&status=pending')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.total).toBeGreaterThan(0)
    expect(res.body.data.list[0]).toEqual(
      expect.objectContaining({
        eventId: expect.any(String),
        eventTitle: expect.any(String),
        userId: expect.any(String),
        name: expect.any(String),
        identities: expect.any(Array),
        status: 'pending',
      }),
    )
  })

  it('待发布活动立即发布 → 200，重复/非法流转 → 409', async () => {
    // EV6006 pending_release → published + enrollmentOpen
    const pub = await request(app.getHttpServer())
      .post('/api/admin/events/EV6006/publish-now')
      .set('Authorization', `Bearer ${token}`)
    expect(pub.status).toBe(200)
    expect(pub.body.code).toBe(0)
    expect(pub.body.data).toEqual({ code: 0 })

    const detail = await request(app.getHttpServer())
      .get('/api/admin/events/EV6006')
      .set('Authorization', `Bearer ${token}`)
    expect(detail.body.data.status).toBe('published')
    expect(detail.body.data.enrollmentOpen).toBe(true)

    // 再次发布（已发布）→ 409
    const again = await request(app.getHttpServer())
      .post('/api/admin/events/EV6006/publish-now')
      .set('Authorization', `Bearer ${token}`)
    expect(again.status).toBe(409)

    // 已结束活动不可编辑 → 409
    const edit = await request(app.getHttpServer())
      .put('/api/admin/events/EV6004')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '硬件创业者圆桌（改）',
        type: '社交',
        startTime: '2026-08-30 19:00',
        endTime: '2026-08-30 21:00',
        location: '共享会议室 A',
        capacity: 30,
        speaker: '周慕深',
        host: '聚屿社区',
        description: '改',
        tags: [],
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
      })
    expect(edit.status).toBe(409)
  })

  it('报名审核通过 → 发放报名积分（enrollPoints 自定义值）', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'U1005' })
    const beforeBalance = (before.body.data as Array<{ balance: number }>)[0].balance

    // EV6001 enrollPoints=50，U1005 待审核 → approved
    const review = await request(app.getHttpServer())
      .post('/api/admin/events/EV6001/enrollments/U1005/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(review.status).toBe(200)
    expect(review.body.data).toEqual({ code: 0 })

    // 报名记录状态已 approved
    const detail = await request(app.getHttpServer())
      .get('/api/admin/events/EV6001')
      .set('Authorization', `Bearer ${token}`)
    const en = detail.body.data.enrollments.find((e: { userId: string }) => e.userId === 'U1005')
    expect(en.status).toBe('approved')

    // 新增 rule 积分流水（delta=50，余额 = 原余额 + 50）
    const after = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'U1005' })
    const record = (after.body.data as Array<{ source: string; delta: number; balance: number }>).find(
      (r) => r.source === 'rule' && r.delta === 50,
    )
    expect(record).toBeDefined()
    expect(record!.balance).toBe(beforeBalance + 50)
  })

  it('签到 → 发放签到积分 + 签到经验值', async () => {
    // EV6002 checkinPoints=100，U1006（持社区个体身份，经验值 200）
    const checkin = await request(app.getHttpServer())
      .post('/api/admin/events/EV6002/checkin')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 'U1006' })
    expect(checkin.status).toBe(200)
    expect(checkin.body.data).toEqual({ code: 0 })

    // 积分流水（delta=100，source=rule）
    const pts = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'U1006' })
    expect(
      (pts.body.data as Array<{ source: string; delta: number }>).some(
        (r) => r.source === 'rule' && r.delta === 100,
      ),
    ).toBe(true)

    // 经验值流水（community_individual，delta=5，source=rule）
    const exp = await request(app.getHttpServer())
      .get('/api/admin/experience-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ targetType: 'individual', targetId: 'U1006' })
    expect(
      (exp.body.data as Array<{ source: string; delta: number }>).some(
        (r) => r.source === 'rule' && r.delta === 5,
      ),
    ).toBe(true)
  })

  it('定时发布扫描 → 到点 published + 写 schedule 通知；自动结束扫描 → ended', async () => {
    const prisma = app.get(PrismaService)
    const scheduler = app.get(SchedulerService)

    // EV6009 scheduled → 置为过去 scheduledAt，扫描后应 published + enrollmentOpen
    await prisma.communityEvent.update({
      where: { id: 'EV6009' },
      data: { status: 'scheduled', scheduledAt: '2020-01-01 00:00' },
    })
    await scheduler.scanScheduledPublish()

    const published = await prisma.communityEvent.findUnique({ where: { id: 'EV6009' } })
    expect(published?.status).toBe('published')
    expect(published?.enrollmentOpen).toBe(true)

    const notification = await prisma.adminNotification.findFirst({
      where: { type: 'schedule', link: '/events' },
    })
    expect(notification).not.toBeNull()

    // 同活动 endTime 置为过去 → 自动结束
    await prisma.communityEvent.update({
      where: { id: 'EV6009' },
      data: { status: 'published', endTime: '2020-01-01 00:00' },
    })
    await scheduler.scanAutoEnd()

    const ended = await prisma.communityEvent.findUnique({ where: { id: 'EV6009' } })
    expect(ended?.status).toBe('ended')
  })
})
