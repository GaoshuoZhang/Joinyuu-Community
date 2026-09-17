/* M2-R R2 验收：活动（浏览/报名/候补递补/取消/电子票） + 商城（商品/地址下单/券码/取消/核销）
 * 前置：docker compose up + prisma migrate + seed；密码 user123 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
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
    expect(res.body.data.list[0]).toEqual(expect.objectContaining({ typeLabel: expect.any(String) }))

    const detail = await request(app.getHttpServer()).get(`/api/app/events/${res.body.data.list[0].id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data).toEqual(expect.objectContaining({ typeLabel: res.body.data.list[0].typeLabel }))
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

    const checkin = await appPost(app, token, `/api/app/events/${event.id}/check-in`, { lat: 31.23, lng: 121.47 })
    expect(checkin.status).toBe(200)
    // 签到即核销
    const after = await prisma.eventTicket.findFirst({ where: { enrollmentId: enrollId } })
    expect(after?.redeemedAt).toBeTruthy()
    // 重复签到（已签到 409 或已核销 400 均可接受）
    const again = await appPost(app, token, `/api/app/events/${event.id}/check-in`, { lat: 31.23, lng: 121.47 })
    expect([400, 409]).toContain(again.status)
  })

  it('商城：商品列表（on 且有库存）包含 fulfillment；下单可取消', async () => {
    const goods = await appGet(app, token, '/api/app/mall/goods')
    expect(goods.status).toBe(200)
    expect(goods.body.data.list.length).toBeGreaterThan(0)
    expect(['physical', 'voucher', 'service']).toContain(goods.body.data.list[0].fulfillment)

    // 实物商品：需先有收货地址
    const physical = goods.body.data.list.find((g: { fulfillment: string; stock: number }) => g.fulfillment === 'physical' && g.stock > 0)
    if (physical) {
      const addr = await appPost(app, token, '/api/app/me/addresses', {
        name: '陈屿',
        phone: '13801210001',
        region: '浙江省杭州市西湖区',
        detail: '文三路 90 号',
        isDefault: true,
      })
      const addressId: string = addr.body.data.id
      const order = await appPost(app, token, '/api/app/mall/orders', {
        goodsId: physical.id,
        addressId,
      })
      expect(order.status).toBe(200)
      const orderId: string = order.body.data.id

      const mine = await appGet(app, token, '/api/app/me/orders')
      expect(mine.body.data.list.some((o: { id: string }) => o.id === orderId)).toBe(true)

      const cancel = await appPost(app, token, `/api/app/mall/orders/${orderId}/cancel`, {})
      expect(cancel.status).toBe(200)
      const after = await prisma.redemptionOrder.findUnique({ where: { id: orderId } })
      expect(after?.status).toBe('cancelled')
    }

    // 券码商品：下单即签发券码
    const voucher = goods.body.data.list.find((g: { fulfillment: string; stock: number }) => g.fulfillment === 'voucher' && g.stock > 0)
    if (voucher) {
      const order = await appPost(app, token, '/api/app/mall/orders', { goodsId: voucher.id })
      expect(order.status).toBe(200)
      const row = await prisma.redemptionOrder.findUnique({ where: { id: order.body.data.id } })
      expect(row?.voucherCode).toMatch(/^V[0-9A-Z]{8}$/)
      expect(row?.voucherExpiresAt).toBeTruthy()
    }
  })
})
