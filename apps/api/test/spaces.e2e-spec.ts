/* M1-D 公共空间 e2e（wiki-backend.md §13 M1-D）：
 * 覆盖：审核通过前时段冲突校验两条分支（同空间已通过预约 / 同名空间已发布活动）+ 使用看板合并占用
 *       + 客户端可见范围 / 可预约范围过滤（游客、命中身份、范围外预约 403）。
 * 前置：docker compose up + prisma migrate + seed（SR2003 待审核 S1001 2026-09-15 19:00-21:00 /
 *       SR2010 待审核 S1004 洽谈室 01 2026-09-09 11:00-12:00 / EV6002 已发布 2026-09-08 聚屿路演厅）。
 * 通过 PrismaService 直插重叠的已通过预约/已发布活动来构造冲突场景。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'
import { appGet, appLoginAs } from './helpers/app-login'
import { PrismaService } from '../src/common/prisma/prisma.service'

describe('M1-D spaces 公共空间（预约审核冲突 + 使用看板）', () => {
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

  it('审核通过前：同空间同时段已通过预约 → 409', async () => {
    const prisma = app.get(PrismaService)
    await prisma.spaceReservation.create({
      data: {
        id: 'SR9001',
        userId: 'U1001',
        userName: '陈屿',
        phone: '13801210001',
        spaceId: 'S1001',
        spaceName: '聚屿路演厅',
        date: '2026-09-15',
        startTime: '20:00',
        endTime: '22:00',
        purpose: '测试占用',
        attendees: 1,
        status: 'approved',
        submittedAt: '2026-09-14 09:00',
        records: [],
      },
    })

    const res = await request(app.getHttpServer())
      .post('/api/admin/space-reservations/SR2003/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(res.status).toBe(409)
    expect(res.body.message).toBe('该时段已有已通过的预约，无法重复占用')
  })

  it('审核通过前：同名空间当日已发布活动 → 409', async () => {
    const prisma = app.get(PrismaService)
    await prisma.communityEvent.create({
      data: {
        id: 'EV9001',
        createdAt: '2026-09-01 09:00',
        title: '测试活动',
        type: '社交',
        startTime: '2026-09-09 11:30',
        endTime: '2026-09-09 12:30',
        location: '洽谈室 01',
        capacity: 10,
        speaker: '测试',
        host: '测试主办方',
        status: 'published',
        enrollmentOpen: false,
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
        description: '测试',
        tags: [],
      },
    })

    const res = await request(app.getHttpServer())
      .post('/api/admin/space-reservations/SR2010/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' })
    expect(res.status).toBe(409)
    expect(res.body.message).toBe('该时段被社区活动占用，无法通过')
  })

  it('使用看板：当日已通过预约 + 同名空间已发布活动合并占用', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/admin/spaces/usage-board')
      .query({ date: '2026-09-08' })
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)

    const list = res.body.data as Array<{
      spaceId: string
      spaceName: string
      startTime: string
      endTime: string
      title: string
      organizer: string
      source: string
    }>

    // 事件源：EV6002 已发布，2026-09-08，聚屿路演厅（S1001）
    const eventEntry = list.find((x) => x.source === 'event')
    expect(eventEntry).toBeDefined()
    expect(eventEntry!.spaceId).toBe('S1001')
    expect(eventEntry!.spaceName).toBe('聚屿路演厅')
    expect(eventEntry!.startTime).toBe('14:00')
    expect(eventEntry!.title).toBe('社区活动「初创企业股权设计讲座」')
    expect(eventEntry!.organizer).toBe('聚屿社区 × 法务伙伴')

    // 预约源：SR2006(S1003)/SR2007(S1004)/SR2009(S1001)
    const reservationKeys = list
      .filter((x) => x.source === 'reservation')
      .map((x) => `${x.spaceId}@${x.startTime}`)
    expect(reservationKeys).toContain('S1001@19:00')
    expect(reservationKeys).toContain('S1003@10:00')
    expect(reservationKeys).toContain('S1004@14:00')

    // 排序：spaceId 升序，同时段 startTime 升序
    const keys = list.map((x) => `${x.spaceId}@${x.startTime}`)
    expect(keys).toEqual([...keys].sort())
  })

  /* S1002 基础信息载荷（对齐管理端「新增/编辑公共空间」表单） */
  const spacePayload = (scope: {
    visibilityIdentities?: string[]
    visibilityLevels?: string[]
    reservationIdentities?: string[]
    reservationLevels?: string[]
  }) => ({
    name: '共享会议室 A',
    type: 'meeting',
    capacity: 12,
    location: '岛屿中心 2F',
    openTime: '00:00',
    closeTime: '23:59',
    allDay: true,
    needReservation: true,
    needApproval: false,
    feePerHour: 0,
    equipment: ['投屏', '白板', '视频会议'],
    description: '中型会议室，适合项目例会与跨企业协作，支持远程视频接入。',
    visibilityIdentities: scope.visibilityIdentities ?? [],
    visibilityLevels: scope.visibilityLevels ?? [],
    reservationIdentities: scope.reservationIdentities ?? [],
    reservationLevels: scope.reservationLevels ?? [],
  })

  const putSpace = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put('/api/admin/spaces/S1002')
      .set('Authorization', `Bearer ${token}`)
      .send(body)

  it('可见范围：受限空间对游客不可见（列表剔除 / 详情与可用时段 404），命中身份的用户可见', async () => {
    /* 管理端把 S1002 可见范围限定为「社区企业」 */
    expect((await putSpace(spacePayload({ visibilityIdentities: ['community_enterprise'] }))).status).toBe(200)

    /* 游客：列表不含 S1002；详情与可用时段一律 404（不暴露存在性） */
    const guestList = await request(app.getHttpServer()).get('/api/app/spaces')
    expect(guestList.status).toBe(200)
    expect((guestList.body.data as Array<{ id: string }>).map((s) => s.id)).not.toContain('S1002')
    expect((await request(app.getHttpServer()).get('/api/app/spaces/S1002')).status).toBe(404)
    expect(
      (await request(app.getHttpServer()).get('/api/app/spaces/S1002/availability').query({ date: '2026-09-20' })).status,
    ).toBe(404)

    /* 持社区企业身份的用户（U1001）：可见 */
    const appToken = await appLoginAs(app)
    const userList = await appGet(app, appToken, '/api/app/spaces')
    expect((userList.body.data as Array<{ id: string }>).map((s) => s.id)).toContain('S1002')
    expect((await appGet(app, appToken, '/api/app/spaces/S1002')).status).toBe(200)
  })

  it('可预约范围：等级不命中 → 403；命中 → 预约成功', async () => {
    /* 可见不限；可预约限定「社区企业 · 3 级」，U1001 的代企业身份为 4 级 → 403 */
    expect(
      (await putSpace(
        spacePayload({ reservationIdentities: ['community_enterprise'], reservationLevels: ['3'] }),
      )).status,
    ).toBe(200)

    const appToken = await appLoginAs(app)
    const book = () =>
      request(app.getHttpServer())
        .post('/api/app/spaces/reservations')
        .set('Authorization', `Bearer ${appToken}`)
        .send({
          spaceId: 'S1002',
          date: '2027-03-01',
          start: '09:00',
          end: '10:00',
          topic: '范围校验',
          attendees: 2,
          asEnterpriseId: 'E2001',
        })

    const outOfRange = await book()
    expect(outOfRange.status).toBe(403)
    expect(outOfRange.body.message).toBe('该空间不在你的可预约范围内')

    /* 改为「社区企业 · 4 级」→ 命中，预约成功 */
    expect(
      (await putSpace(
        spacePayload({ reservationIdentities: ['community_enterprise'], reservationLevels: ['4'] }),
      )).status,
    ).toBe(200)
    const booked = await book()
    expect(booked.status).toBe(201)
    expect(booked.body.data.status).toBe('approved')

    /* 回收测试预约，避免残留占用 */
    const mine = await appGet(app, appToken, '/api/app/me/reservations')
    const created = (mine.body.data as Array<{ id: string; date: string }>).find((r) => r.date === '2027-03-01')
    expect(created).toBeTruthy()
    expect(
      (await request(app.getHttpServer())
        .post(`/api/app/spaces/reservations/${created!.id}/cancel`)
        .set('Authorization', `Bearer ${appToken}`)).status,
    ).toBe(200)

    /* 复位为「不限」 */
    expect((await putSpace(spacePayload({}))).status).toBe(200)
  })
})
