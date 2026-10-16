/* M2-R R2 验收：活动（浏览/报名/候补递补/取消/电子票） + 商城（商品/地址下单/券码/取消/核销）
 * 前置：docker compose up + prisma migrate + seed；密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { RedisService } from '../src/common/redis/redis.service'
import { reseed } from './helpers/reseed'
import { appGet, appLoginAs, appPost } from './helpers/app-login'

describe('M2-R R2 app 活动与商城', () => {
  let app: INestApplication
  let prisma: PrismaService
  let token: string

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)
    token = await appLoginAs(app, '13801210001', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('活动列表 published 且返回（无签名也可浏览）', async () => {
    const res = await request(app.getHttpServer()).get('/api/app/events?pageSize=5')
    expect(res.status).toBe(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.list)).toBe(true)
    expect(res.body.data.list[0]).toEqual(expect.objectContaining({
      typeLabel: expect.any(String),
      enrollmentOpen: expect.any(Boolean),
    }))
    expect(res.body.data.list[0]).not.toHaveProperty('approvedCount')

    const detail = await request(app.getHttpServer()).get(`/api/app/events/${res.body.data.list[0].id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data).toEqual(expect.objectContaining({ typeLabel: res.body.data.list[0].typeLabel }))
    expect(detail.body.data).not.toHaveProperty('approvedCount')
  })

  it('报名已发布开放报名的活动 → 我的报名 → 取消', async () => {
    const ev = await prisma.communityEvent.findFirst({
      where: { status: 'published', enrollmentOpen: true },
      orderBy: { startTime: 'asc' },
    })
    if (!ev) return
    const eventId: string = ev.id

    const enroll = await appPost(app, token, `/api/app/events/${eventId}/enroll`, {})
    expect(enroll.status).toBe(200)
    expect(['approved', 'pending', 'waitlisted']).toContain(enroll.body.data.status)

    const mine = await appGet(app, token, '/api/app/me/enrollments')
    expect(mine.body.data.list.some((e: { eventId: string }) => e.eventId === eventId)).toBe(true)

    const cancel = await appPost(app, token, `/api/app/events/${eventId}/enroll/cancel`, {})
    expect([200, 409]).toContain(cancel.status)
  })

  it('暂停报名活动下发 enrollmentOpen=false 并拒绝报名', async () => {
    const event = await prisma.communityEvent.findFirst({
      where: { status: 'published', enrollmentOpen: false, enrollments: { none: { userId: 'U1001' } } },
    })
    expect(event).toBeTruthy()
    if (!event) return

    const detail = await appGet(app, token, `/api/app/events/${event.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.enrollmentOpen).toBe(false)

    const enroll = await appPost(app, token, `/api/app/events/${event.id}/enroll`, {})
    expect(enroll.status).toBe(400)
    expect(enroll.body.message).toBe('报名暂未开放')
  })

  it('候补报名可取消，且清除候补标记与顺序', async () => {
    const event = await prisma.communityEvent.findFirst({
      where: { status: 'published', enrollments: { none: { userId: 'U1001' } } },
      orderBy: { startTime: 'desc' },
    })
    expect(event).toBeTruthy()
    if (!event) return

    const enrollment = await prisma.eventEnrollment.create({
      data: {
        eventId: event.id,
        userId: 'U1001',
        name: '陈屿',
        enterprise: '星澜智能科技',
        phone: '13801210001',
        appliedAt: '2026-09-19 10:00',
        status: 'waitlisted',
        waitlisted: true,
        waitlistOrder: 1,
      },
    })

    const cancel = await appPost(app, token, `/api/app/events/${event.id}/enroll/cancel`, {})
    expect(cancel.status).toBe(200)
    const after = await prisma.eventEnrollment.findUnique({ where: { id: enrollment.id } })
    expect(after).toMatchObject({ status: 'cancelled', waitlisted: false, waitlistOrder: null })
  })

  it('已报名成员可查看取消活动详情，无关成员不可查看', async () => {
    const event = await prisma.communityEvent.findFirst({
      where: { status: 'published', enrollments: { none: { userId: 'U1001' } } },
    })
    expect(event).toBeTruthy()
    if (!event) return
    await prisma.eventEnrollment.create({
      data: {
        eventId: event.id,
        userId: 'U1001',
        name: '陈屿',
        enterprise: '',
        phone: '13801210001',
        appliedAt: '2026-09-20 09:00',
        status: 'approved',
      },
    })
    await prisma.communityEvent.update({ where: { id: event.id }, data: { status: 'cancelled' } })

    const detail = await appGet(app, token, `/api/app/events/${event.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data).toMatchObject({ id: event.id, status: 'cancelled', myEnrollmentStatus: 'approved' })

    const outsider = await appLoginAs(app, '13801210009', 'user123')
    expect((await appGet(app, outsider, `/api/app/events/${event.id}`)).status).toBe(404)
  })

  it('电子票：approved 报名签发 HMAC 核销码，签到即核销（未配置地理时仅时间窗）', async () => {
    // 直接构造一个已通过报名 + 无地理位置活动来验证签到链路
    const event = await prisma.communityEvent.findFirst({
      where: { status: 'published', venueLat: null },
      orderBy: { startTime: 'asc' },
    })
    if (!event) return
    const existing = await prisma.eventEnrollment.findFirst({ where: { eventId: event.id, userId: 'U1001' } })
    if (existing) await prisma.eventEnrollment.delete({ where: { id: existing.id } })
    await prisma.eventEnrollment.create({
      data: {
        eventId: event.id,
        userId: 'U1001',
        name: '陈屿',
        enterprise: '星澜智能科技',
        phone: '13801210001',
        appliedAt: '2026-09-15 10:00',
        status: 'approved',
      },
    })
    // 保证时间窗内（把活动开始时间设为当前时间 +5 分钟）
    const fmt = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const start = new Date(Date.now() + 5 * 60 * 1000)
    const end = new Date(Date.now() + 65 * 60 * 1000)
    await prisma.communityEvent.update({
      where: { id: event.id },
      data: { startTime: fmt(start), endTime: fmt(end) },
    })

    const me = await appGet(app, token, '/api/app/me/enrollments')
    const myEnroll = me.body.data.list.find((e: { eventId: string }) => e.eventId === event.id)
    expect(myEnroll).toBeTruthy()
    const enrollId: number = myEnroll.id

    const ticket = await appGet(app, token, `/api/app/events/${event.id}/ticket`)
    expect(ticket.status).toBe(200)
    expect(ticket.body.data.eventId).toBe(event.id)
    expect(ticket.body.data.ticketCode).toMatch(/^[0-9A-F]{8}$/)
    expect(ticket.body.data.status).toBe('valid')

    await prisma.communityEvent.update({
      where: { id: event.id },
      data: { status: 'ended' },
    })
    const expired = await appGet(app, token, `/api/app/events/${event.id}/ticket`)
    expect(expired.status).toBe(200)
    expect(expired.body.data.status).toBe('expired')
    await prisma.communityEvent.update({
      where: { id: event.id },
      data: { status: 'published' },
    })

    const checkin = await appPost(app, token, `/api/app/events/${event.id}/check-in`, { lat: 31.23, lng: 121.47 })
    expect(checkin.status).toBe(200)
    // 签到即核销
    const after = await prisma.eventTicket.findFirst({ where: { enrollmentId: enrollId } })
    expect(after?.redeemedAt).toBeTruthy()
    const cancelCheckedIn = await appPost(app, token, `/api/app/events/${event.id}/enroll/cancel`, {})
    expect(cancelCheckedIn.status).toBe(409)
    expect(cancelCheckedIn.body.message).toBe('已签到的活动不可取消报名')
    // 重复签到（已签到 409 或已核销 400 均可接受）
    const again = await appPost(app, token, `/api/app/events/${event.id}/check-in`, { lat: 31.23, lng: 121.47 })
    expect([400, 409]).toContain(again.status)
  })

  it('签到码：无需定位即可签到；错误码 400、第 4 次起 428 + 图形验证码后成功（返回第 N 位/活动信息）', async () => {
    const redis = app.get(RedisService)
    const token6 = await appLoginAs(app, '13801210006', 'user123')
    const fmt = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const start = new Date(Date.now() + 5 * 60 * 1000)
    const end = new Date(Date.now() + 65 * 60 * 1000)

    /* 专项活动：无位置校验、启用 6 位签到码 */
    const event = await prisma.communityEvent.create({
      data: {
        id: 'EV9101',
        createdAt: fmt(new Date()),
        title: '签到码防爆破专项',
        type: '培训',
        startTime: fmt(start),
        endTime: fmt(end),
        location: '测试场地',
        capacity: 10,
        speaker: '—',
        host: '聚屿社区',
        status: 'published',
        enrollmentOpen: true,
        visibilityIdentities: [],
        visibilityLevels: [],
        enrollmentIdentities: [],
        enrollmentLevels: [],
        requireReview: false,
        description: '',
        tags: [],
        checkinLocationRequired: false,
        checkinCodeRequired: true,
        checkinCode: '123456',
      },
    })
    await prisma.eventEnrollment.create({
      data: {
        eventId: event.id,
        userId: 'U1006',
        name: '沈嘉禾',
        enterprise: '',
        phone: '13801210006',
        appliedAt: fmt(new Date()),
        status: 'approved',
      },
    })

    /* 标志下发：只发 enabled 布尔，不下发签到码明文 */
    const detail = await appGet(app, token6, `/api/app/events/${event.id}`)
    expect(detail.body.data.checkinCodeEnabled).toBe(true)
    expect(detail.body.data.checkinLocationRequired).toBe(false)
    expect(detail.body.data.checkinCode).toBeUndefined()

    /* 无位置校验：不带经纬度直接提交，但码错误 → 400 */
    const wrong = await appPost(app, token6, `/api/app/events/${event.id}/check-in`, { code: '000000' })
    expect(wrong.status).toBe(400)
    expect(wrong.body.message).toBe('签到码错误')
    await appPost(app, token6, `/api/app/events/${event.id}/check-in`, { code: '000000' })
    await appPost(app, token6, `/api/app/events/${event.id}/check-in`, { code: '000000' })

    /* 第 4 次起需图形验证码（未带 → 428） */
    const locked = await appPost(app, token6, `/api/app/events/${event.id}/check-in`, { code: '000000' })
    expect(locked.status).toBe(428)

    /* 验证码 + 正确签到码 → 200 且返回第 N 位与活动信息 */
    const captcha = await request(app.getHttpServer()).get('/api/app/auth/captcha')
    const captchaId: string = captcha.body.data.captchaId
    const captchaCode = await redis.getCache<string>(`captcha:app:${captchaId}`)
    expect(captchaCode).toBeTruthy()
    const ok = await appPost(app, token6, `/api/app/events/${event.id}/check-in`, {
      code: '123456',
      captchaId,
      captchaCode,
    })
    expect(ok.status).toBe(200)
    expect(ok.body.data).toEqual(
      expect.objectContaining({
        pointsAwarded: expect.any(Number),
        position: 1,
        title: '签到码防爆破专项',
      }),
    )
    expect(ok.body.data.startTime).toBeTruthy()
    expect(ok.body.data.endTime).toBeTruthy()
  })

  it('商城：统一券码下单即签发券码，可退款（退积分+回库存）', async () => {
    const goods = await appGet(app, token, '/api/app/mall/goods')
    expect(goods.status).toBe(200)
    expect(goods.body.data.list.length).toBeGreaterThan(0)
    /* 统一券码兑换：不再下发 fulfillment/shippingMethods */
    expect(goods.body.data.list[0]).not.toHaveProperty('fulfillment')

    const inStock = goods.body.data.list.find((g: { stock: number }) => g.stock > 0)
    expect(inStock).toBeTruthy()
    const order = await appPost(app, token, '/api/app/mall/orders', { goodsId: inStock.id })
    expect(order.status).toBe(200)
    const orderId: string = order.body.data.id

    const row = await prisma.redemptionOrder.findUnique({ where: { id: orderId } })
    expect(row?.status).toBe('pending_use')
    expect(row?.voucherCode).toMatch(/^V[0-9A-Z]{8}$/)
    expect(row?.voucherExpiresAt).toBeTruthy()

    const mine = await appGet(app, token, '/api/app/me/orders')
    expect(mine.body.data.list.some((o: { id: string }) => o.id === orderId)).toBe(true)

    /* 用户侧不再提供核销/收货端点 */
    expect((await appPost(app, token, `/api/app/mall/orders/${orderId}/use`, {})).status).toBe(404)
    expect((await appPost(app, token, `/api/app/mall/orders/${orderId}/confirm`, {})).status).toBe(404)

    /* 核销前可退款：退积分 + 回补库存 */
    const before = await prisma.user.findUnique({ where: { uid: 'U1001' } })
    const cancel = await appPost(app, token, `/api/app/mall/orders/${orderId}/cancel`, {})
    expect(cancel.status).toBe(200)
    const after = await prisma.redemptionOrder.findUnique({ where: { id: orderId } })
    expect(after?.status).toBe('cancelled')
    const afterUser = await prisma.user.findUnique({ where: { uid: 'U1001' } })
    expect(afterUser?.points).toBe((before?.points ?? 0) + (row?.points ?? 0))

    /* 已完成订单（后台核销后）客户端派生 completed；换一件商品避开同商品 3s 防重复标记 */
    const second = goods.body.data.list.find(
      (g: { id: string; stock: number }) => g.stock > 0 && g.id !== inStock.id,
    )
    const done = await appPost(app, token, '/api/app/mall/orders', { goodsId: second.id })
    expect(done.status).toBe(200)
    await prisma.redemptionOrder.update({
      where: { id: done.body.data.id },
      data: { status: 'finished', finishedAt: '2026-09-19 12:00' },
    })
    const mine2 = await appGet(app, token, '/api/app/me/orders')
    const completed = mine2.body.data.list.find((item: { id: string }) => item.id === done.body.data.id)
    expect(completed.status).toBe('completed')
  })

  it('商城：缺货商品保持可见且下单拦截；券按商品有效期签发并派生 expired 状态', async () => {
    /* 缺货（restock, stock 0）：列表/详情可见，下单报库存不足（O-07 修复） */
    await prisma.mallGoods.create({
      data: {
        id: 'G9002',
        name: '缺货验收券',
        category: 'GC003',
        points: 10,
        stock: 0,
        status: 'restock',
        description: '缺货可见性验收',
        redeemedCount: 0,
        visibilityIdentities: [],
        visibilityLevels: [],
        orderIdentities: [],
        orderLevels: [],
        createdAt: '2026-09-16 10:00',
      },
    })
    const list = await appGet(app, token, '/api/app/mall/goods')
    expect(list.body.data.list.some((g: { id: string }) => g.id === 'G9002')).toBe(true)
    const detail = await appGet(app, token, '/api/app/mall/goods/G9002')
    expect(detail.status).toBe(200)
    expect(detail.body.data.stock).toBe(0)
    const orderOOS = await appPost(app, token, '/api/app/mall/orders', { goodsId: 'G9002' })
    expect(orderOOS.status).toBe(400)
    expect(orderOOS.body.message).toBe('库存不足')

    /* 券有效期 = 商品 validDays（天） */
    const goodsId = 'G9003'
    await prisma.mallGoods.create({
      data: {
        id: goodsId,
        name: '有效期验收券',
        category: 'GC003',
        points: 10,
        stock: 5,
        status: 'on',
        description: '有效期验收',
        redeemedCount: 0,
        validDays: 2,
        visibilityIdentities: [],
        visibilityLevels: [],
        orderIdentities: [],
        orderLevels: [],
        createdAt: '2026-09-16 10:00',
      },
    })
    const order = await appPost(app, token, '/api/app/mall/orders', { goodsId })
    expect(order.status).toBe(200)
    const row = await prisma.redemptionOrder.findUnique({ where: { id: order.body.data.id } })
    expect(row?.voucherCode).toMatch(/^V[0-9A-Z]{8}$/)
    const created = new Date(String(row?.createdAt).replace(' ', 'T'))
    const expires = new Date(String(row?.voucherExpiresAt).replace(' ', 'T'))
    expect(Math.round((expires.getTime() - created.getTime()) / 86_400_000)).toBe(2)

    /* 过期后我的订单派生 expired 状态（自动退款由定时任务落库） */
    await prisma.redemptionOrder.update({
      where: { id: order.body.data.id },
      data: { voucherExpiresAt: '2026-09-01 00:00' },
    })
    const mine = await appGet(app, token, '/api/app/me/orders')
    const expired = mine.body.data.list.find((item: { id: string }) => item.id === order.body.data.id)
    expect(expired.status).toBe('expired')
  })

  it('商城：订单详情仅本人可见（非本人/不存在 404，形状与列表项一致）', async () => {
    /* 种子订单 RO2004（U1001 的待使用券） */
    const detail = await appGet(app, token, '/api/app/me/orders/RO2004')
    expect(detail.status).toBe(200)
    expect(detail.body.data).toMatchObject({
      id: 'RO2004',
      goodsId: 'G1005',
      goodsName: '精品咖啡月卡',
      voucherCode: 'V20260906B',
    })
    expect(detail.body.data).not.toHaveProperty('userId')
    expect(detail.body.data).not.toHaveProperty('fulfillment')

    /* 与列表项复用同一 DTO，客户端可直接复用 MyOrder 类型 */
    const mine = await appGet(app, token, '/api/app/me/orders')
    expect(detail.body.data).toEqual(mine.body.data.list.find((o: { id: string }) => o.id === 'RO2004'))

    /* 不存在 / 非本人：一律 404，不暴露存在性 */
    expect((await appGet(app, token, '/api/app/me/orders/RO9999')).status).toBe(404)
    const outsider = await appLoginAs(app, '13801210009', 'user123')
    expect((await appGet(app, outsider, '/api/app/me/orders/RO2004')).status).toBe(404)
  })
})
