/* M2-R R2 并发安全验收：商城库存/积分竞态、活动重复报名、签到幂等、候补递补唯一性
 * 前置：docker compose up + prisma migrate reset（21 迁移全量）+ seed；用户密码 user123
 * 说明：R2 并发保护分三层——Redis 原子标记（acquireFlag，同用户同商品防连点）、
 *       数据库条件更新（updateMany 比较并交换，防超卖）、唯一约束（P2002，防重复报名）。
 *       本套件用不同用户打同一商品以绕开「同用户」标记层，专测数据库层的超卖防护。 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { reseed } from './helpers/reseed'
import { appLoginAs, appPost } from './helpers/app-login'

const pad = (n: number): string => String(n).padStart(2, '0')
const fmt = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

describe('M2-R R2 并发安全（活动/商城）', () => {
  let app: INestApplication
  let prisma: PrismaService
  let tokens: string[]

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    /* 顺序登录：并发登录会同时打满验证码读写，与 Redis 客户端 maxRetriesPerRequest=1 的
     * 重试策略叠加时可能出现瞬时 ECONNRESET（本套件验证的是业务端点并发，不测登录并发）。 */
    tokens = []
    for (const phone of ['13801210001', '13801210002', '13801210003', '13801210005']) {
      tokens.push(await appLoginAs(app, phone, 'user123'))
    }
  })

  afterAll(async () => {
    await app.close()
  })

  it('商城：库存 1 的商品被 4 个用户并发下单，仅 1 单成功且不超卖、积分只扣一次', async () => {
    const goodsId = 'G9001'
    const price = 100
    await prisma.mallGoods.create({
      data: {
        id: goodsId,
        name: '并发压测商品（权益券）',
        category: 'GC003',
        fulfillment: 'voucher',
        points: price,
        stock: 1,
        status: 'on',
        description: '仅用于并发验收',
        redeemedCount: 0,
        shippingMethods: [],
        visibilityIdentities: [],
        visibilityLevels: [],
        orderIdentities: [],
        orderLevels: [],
        createdAt: '2026-09-16 10:00',
      },
    })
    // 保证每个参与者都有足够积分，便于验证「恰好扣一次」
    const uids = ['U1001', 'U1002', 'U1003', 'U1005']
    await prisma.user.updateMany({ where: { uid: { in: uids } }, data: { points: 10000 } })

    const results = await Promise.all(
      tokens.map((t) => appPost(app, t, '/api/app/mall/orders', { goodsId })),
    )
    const ok = results.filter((r) => r.status === 200)
    const failed = results.filter((r) => r.status !== 200)
    expect(ok.length).toBe(1)
    expect(failed.length).toBe(tokens.length - 1)
    failed.forEach((r) => expect([400, 409]).toContain(r.status))

    const goods = await prisma.mallGoods.findUnique({ where: { id: goodsId } })
    expect(goods?.stock).toBe(0)
    expect(goods?.redeemedCount).toBe(1)

    const orders = await prisma.redemptionOrder.findMany({ where: { goodsId } })
    expect(orders.length).toBe(1)
    const buyer = orders[0].userId
    // 仅该商品本次兑换产生一条扣减流水（按商品编号限定，排除 seed 历史流水）
    const records = await prisma.pointsRecord.findMany({
      where: { userId: buyer, source: 'redemption', reason: { contains: goodsId } },
    })
    expect(records.length).toBe(1)
    const buyerRow = await prisma.user.findUnique({ where: { uid: buyer } })
    expect(buyerRow?.points).toBe(10000 - price)
    // 未成功者积分不被扣减
    const losers = uids.filter((u) => u !== buyer)
    const loserRows = await prisma.user.findMany({ where: { uid: { in: losers } } })
    loserRows.forEach((u) => expect(u.points).toBe(10000))
  })

  it('商城：同一用户并发重复下单，Redis 标记 + 条件更新保证仅 1 单', async () => {
    const goodsId = 'G9002'
    await prisma.mallGoods.create({
      data: {
        id: goodsId,
        name: '并发压测商品（连点）',
        category: 'GC003',
        fulfillment: 'voucher',
        points: 10,
        stock: 10,
        status: 'on',
        description: '仅用于并发验收',
        redeemedCount: 0,
        shippingMethods: [],
        visibilityIdentities: [],
        visibilityLevels: [],
        orderIdentities: [],
        orderLevels: [],
        createdAt: '2026-09-16 10:00',
      },
    })
    const token = tokens[0]
    const results = await Promise.all(
      Array.from({ length: 5 }, () => appPost(app, token, '/api/app/mall/orders', { goodsId })),
    )
    const ok = results.filter((r) => r.status === 200)
    expect(ok.length).toBe(1)
    const mine = await prisma.redemptionOrder.findMany({ where: { userId: 'U1001', goodsId } })
    expect(mine.length).toBe(1)
    const goods = await prisma.mallGoods.findUnique({ where: { id: goodsId } })
    expect(goods?.stock).toBe(9)
  })

  it('活动：同一用户并发报名同一活动，唯一约束保证仅 1 条记录且积分只发一次', async () => {
    const eventId = 'EV9091'
    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    await prisma.communityEvent.create({
      data: {
        id: eventId,
        createdAt: '2026-09-16 10:00',
        title: '并发验收活动（报名）',
        type: '沙龙',
        startTime: fmt(start),
        endTime: fmt(new Date(start.getTime() + 2 * 60 * 60 * 1000)),
        location: '并发验收场地',
        capacity: 50,
        speaker: '测试讲师',
        host: '聚屿社区',
        status: 'published',
        enrollmentOpen: true,
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
        enrollmentDeadline: fmt(new Date(start.getTime() - 60 * 60 * 1000)),
        description: '仅用于并发验收',
        tags: [],
      },
    })

    const token = tokens[0]
    const results = await Promise.all(
      Array.from({ length: 5 }, () => appPost(app, token, `/api/app/events/${eventId}/enroll`, {})),
    )
    const ok = results.filter((r) => r.status === 200)
    expect(ok.length).toBe(1)
    const rows = await prisma.eventEnrollment.findMany({ where: { eventId, userId: 'U1001' } })
    expect(rows.length).toBe(1)
    expect(rows[0].status).toBe('approved')
    // 报名积分由 dedupeKey 保证只发一次
    const enrollPoints = await prisma.pointsRecord.findMany({
      where: { userId: 'U1001', dedupeKey: `enroll:U1001:${eventId}` },
    })
    expect(enrollPoints.length).toBe(1)
  })

  it('活动：并发签到仅 1 次生效，重复签到被拒且积分不重复发放', async () => {
    const eventId = 'EV9092'
    const start = new Date(Date.now() + 5 * 60 * 1000)
    await prisma.communityEvent.create({
      data: {
        id: eventId,
        createdAt: '2026-09-16 10:00',
        title: '并发验收活动（签到）',
        type: '沙龙',
        startTime: fmt(start),
        endTime: fmt(new Date(start.getTime() + 2 * 60 * 60 * 1000)),
        location: '并发验收场地',
        capacity: 50,
        speaker: '测试讲师',
        host: '聚屿社区',
        status: 'published',
        enrollmentOpen: true,
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
        checkinRadiusM: 200,
        checkinOpenMin: 30,
        checkinCloseMin: 30,
        description: '仅用于并发验收',
        tags: [],
      },
    })
    await prisma.eventEnrollment.create({
      data: {
        eventId,
        userId: 'U1001',
        name: '陈屿',
        enterprise: '星澜智能科技',
        phone: '13801210001',
        appliedAt: '2026-09-16 10:00',
        status: 'approved',
      },
    })

    const token = tokens[0]
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        appPost(app, token, `/api/app/events/${eventId}/check-in`, { lat: 31.23, lng: 121.47 }),
      ),
    )
    const ok = results.filter((r) => r.status === 200)
    expect(ok.length).toBe(1)
    const rows = await prisma.eventEnrollment.findMany({ where: { eventId, userId: 'U1001' } })
    expect(rows.length).toBe(1)
    expect(rows[0].checkedIn).toBe(true)
    const checkinRecords = await prisma.pointsRecord.findMany({
      where: { userId: 'U1001', dedupeKey: `checkin:U1001:${eventId}` },
    })
    expect(checkinRecords.length).toBe(1)
  })

  it('活动：容量 1 满员后候补按序排队，已通过者取消仅递补一位且不发生双递补', async () => {
    const eventId = 'EV9093'
    const start = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
    await prisma.communityEvent.create({
      data: {
        id: eventId,
        createdAt: '2026-09-16 10:00',
        title: '并发验收活动（候补）',
        type: '沙龙',
        startTime: fmt(start),
        endTime: fmt(new Date(start.getTime() + 2 * 60 * 60 * 1000)),
        location: '并发验收场地',
        capacity: 1,
        speaker: '测试讲师',
        host: '聚屿社区',
        status: 'published',
        enrollmentOpen: true,
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
        enrollmentDeadline: fmt(new Date(start.getTime() - 60 * 60 * 1000)),
        description: '仅用于并发验收',
        tags: [],
      },
    })

    const [tA, tB, tC] = tokens
    const enrollA = await appPost(app, tA, `/api/app/events/${eventId}/enroll`, {})
    expect(enrollA.status).toBe(200)
    expect(enrollA.body.data.status).toBe('approved')

    const enrollB = await appPost(app, tB, `/api/app/events/${eventId}/enroll`, {})
    const enrollC = await appPost(app, tC, `/api/app/events/${eventId}/enroll`, {})
    expect(enrollB.body.data.status).toBe('waitlisted')
    expect(enrollC.body.data.status).toBe('waitlisted')
    expect(enrollB.body.data.waitlistOrder).toBeLessThan(enrollC.body.data.waitlistOrder)

    // 已通过者取消 → 释放 1 个名额，应只递补候补第 1 位
    const cancel = await appPost(app, tA, `/api/app/events/${eventId}/enroll/cancel`, {})
    expect([200, 409]).toContain(cancel.status)

    const rows = await prisma.eventEnrollment.findMany({ where: { eventId }, orderBy: { id: 'asc' } })
    // 三条报名记录都在（发起者置 cancelled，不做物理删除）
    expect(rows.length).toBe(3)
    const approved = rows.filter((r) => r.status === 'approved')
    const waitlisted = rows.filter((r) => r.status === 'waitlisted')
    expect(approved.length).toBe(1)
    expect(waitlisted.length).toBe(1)
    // 递补者必须是候补序号最靠前者（U1002），不能是 U1003
    expect(approved[0].userId).toBe('U1002')
    expect(waitlisted[0].userId).toBe('U1003')
  })

  it('并发取消：两位已通过者同时取消且候补充足时，递补人数不超过释放名额', async () => {
    const eventId = 'EV9094'
    const start = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
    await prisma.communityEvent.create({
      data: {
        id: eventId,
        createdAt: '2026-09-16 10:00',
        title: '并发验收活动（双取消）',
        type: '沙龙',
        startTime: fmt(start),
        endTime: fmt(new Date(start.getTime() + 2 * 60 * 60 * 1000)),
        location: '并发验收场地',
        capacity: 2,
        speaker: '测试讲师',
        host: '聚屿社区',
        status: 'published',
        enrollmentOpen: true,
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
        enrollmentDeadline: fmt(new Date(start.getTime() - 60 * 60 * 1000)),
        description: '仅用于并发验收',
        tags: [],
      },
    })
    await prisma.eventEnrollment.createMany({
      data: [
        { eventId, userId: 'U1001', name: '陈屿', enterprise: 'x', phone: '13801210001', appliedAt: '2026-09-16 10:00', status: 'approved' },
        { eventId, userId: 'U1002', name: '林晚舟', enterprise: 'x', phone: '13801210002', appliedAt: '2026-09-16 10:00', status: 'approved' },
        { eventId, userId: 'U1003', name: '苏晴', enterprise: 'x', phone: '13801210003', appliedAt: '2026-09-16 10:00', status: 'waitlisted', waitlisted: true, waitlistOrder: 1 },
        { eventId, userId: 'U1005', name: '顾北辰', enterprise: 'x', phone: '13801210005', appliedAt: '2026-09-16 10:00', status: 'waitlisted', waitlisted: true, waitlistOrder: 2 },
      ],
    })

    await Promise.all([
      appPost(app, tokens[0], `/api/app/events/${eventId}/enroll/cancel`, {}),
      appPost(app, tokens[1], `/api/app/events/${eventId}/enroll/cancel`, {}),
    ])

    const rows = await prisma.eventEnrollment.findMany({ where: { eventId } })
    const approved = rows.filter((r) => r.status === 'approved')
    // 释放 2 个名额 → 至多递补 2 位，绝不能超过容量
    expect(approved.length).toBeLessThanOrEqual(2)
  })
})
