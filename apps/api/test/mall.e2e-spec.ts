/* 商城后台验收（统一券码兑换三态）：
 * 商品列表类型回填字典名称 + 订单核销/退款/归档状态机 + 退款事务（source=redemption 退积分 + 回补库存）+ 券码搜索。
 * 前置：docker compose up + prisma migrate + seed（RO2003 待使用 U1005/G1002 380 分、G1002 库存 18） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('mall 积分商城（统一券码）', () => {
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

  it('商品列表：类型回填字典名称（categoryLabel）', async () => {
    const [list, dict] = await Promise.all([
      request(app.getHttpServer())
        .get('/api/admin/mall/goods')
        .query({ page: 1, pageSize: 10 })
        .set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer()).get('/api/admin/dicts/goods_category').set('Authorization', `Bearer ${token}`),
    ])
    expect(list.status).toBe(200)
    expect(list.body.data.list.length).toBeGreaterThan(0)
    const labels = new Map<string, string>(
      (dict.body.data as Array<{ code: string; label: string }>).map((e) => [e.code, e.label]),
    )
    for (const goods of list.body.data.list as Array<{ category: string; categoryLabel: string }>) {
      expect(goods.categoryLabel).toBe(labels.get(goods.category))
    }
  })

  it('非法流转 → 404/409 精确文案', async () => {
    const notFound = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO9999/verify')
      .set('Authorization', `Bearer ${token}`)
    expect(notFound.status).toBe(404)
    expect(notFound.body.message).toBe('兑换订单不存在')

    // 已完成订单不可核销
    const verifyFinished = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2001/verify')
      .set('Authorization', `Bearer ${token}`)
    expect(verifyFinished.status).toBe(409)
    expect(verifyFinished.body.message).toBe('仅待使用的订单可核销')

    // 待使用订单不可直接归档
    const archivePending = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/archive')
      .set('Authorization', `Bearer ${token}`)
    expect(archivePending.status).toBe(409)
    expect(archivePending.body.message).toBe('仅已完成或已取消的订单可归档')

    // 已完成订单不可退款
    const cancelFinished = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2001/cancel')
      .set('Authorization', `Bearer ${token}`)
    expect(cancelFinished.status).toBe(409)
    expect(cancelFinished.body.message).toBe('仅待使用的订单可退款')
  })

  it('核销 → 归档 链路', async () => {
    const verify = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/verify')
      .set('Authorization', `Bearer ${token}`)
    expect(verify.status).toBe(200)
    expect(verify.body.code).toBe(0)

    const afterVerify = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'RO2003' })
    expect(afterVerify.body.data.list[0].status).toBe('finished')
    expect(afterVerify.body.data.list[0].usedAt).toBeTruthy()

    // 重复核销 → 409
    const verifyAgain = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/verify')
      .set('Authorization', `Bearer ${token}`)
    expect(verifyAgain.status).toBe(409)

    const archive = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/archive')
      .set('Authorization', `Bearer ${token}`)
    expect(archive.status).toBe(200)
    expect(archive.body.code).toBe(0)

    const afterArchive = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'RO2003' })
    expect(afterArchive.body.data.list.length).toBe(0)
  })

  it('券码搜索：keyword 精确命中券码锁定订单', async () => {
    /* 种子 RO2004 券码 V20260906B */
    const byCode = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'V20260906B' })
    expect(byCode.status).toBe(200)
    expect(byCode.body.data.list.length).toBe(1)
    expect(byCode.body.data.list[0].id).toBe('RO2004')
    expect(byCode.body.data.list[0].voucherCode).toBe('V20260906B')
  })

  it('退款事务：退积分（source=redemption）+ 回补库存', async () => {
    // 重置种子，保证 RO2003 回到待使用、U1005 余额 600、G1002 库存 18
    reseed()

    const goodsBefore = await request(app.getHttpServer())
      .get('/api/admin/mall/goods')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'G1002' })
    expect(goodsBefore.body.data.list[0].stock).toBe(18)
    expect(goodsBefore.body.data.list[0].redeemedCount).toBe(6)

    const cancel = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/cancel')
      .set('Authorization', `Bearer ${token}`)
    expect(cancel.status).toBe(200)
    expect(cancel.body.code).toBe(0)

    // 订单置 cancelled 且记 cancelReason
    const orderAfter = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'RO2003' })
    expect(orderAfter.body.data.list[0].status).toBe('cancelled')
    expect(orderAfter.body.data.list[0].cancelReason).toBeTruthy()

    // 退回积分：U1005 新增 source=redemption、delta=+380、balance=980、operator=系统
    const records = await request(app.getHttpServer())
      .get('/api/admin/points-records')
      .set('Authorization', `Bearer ${token}`)
      .query({ userId: 'U1005' })
    expect(records.status).toBe(200)
    const refund = records.body.data.find(
      (r: { source: string; delta: number }) => r.source === 'redemption' && r.delta === 380,
    )
    expect(refund).toBeDefined()
    expect(refund.balance).toBe(980)
    expect(refund.operator).toBe('系统')

    // 回补库存：stock+1、redeemedCount-1
    const goodsAfter = await request(app.getHttpServer())
      .get('/api/admin/mall/goods')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'G1002' })
    expect(goodsAfter.body.data.list[0].stock).toBe(19)
    expect(goodsAfter.body.data.list[0].redeemedCount).toBe(5)
  })
})
