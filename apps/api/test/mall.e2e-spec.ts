/* M1-D 商城验收（wiki-backend.md §7.10/§8.1/§8.3）：
 * 商品列表类型回填字典名称 + 兑换订单状态机（发货/完成/取消）+ 取消事务（source=redemption 退积分 + 回补库存）。
 * 前置：docker compose up + prisma migrate + seed（含 RO2003 待发货 U1005/G1002 380 分、G1002 库存 18） */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { reseed } from './helpers/reseed'
import { loginAs } from './helpers/login'

describe('M1-D mall 积分商城', () => {
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
      .post('/api/admin/mall/redemption-orders/RO9999/ship')
      .set('Authorization', `Bearer ${token}`)
    expect(notFound.status).toBe(404)
    expect(notFound.body.message).toBe('兑换订单不存在')

    // 已完成订单不可发货
    const shipFinished = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2001/ship')
      .set('Authorization', `Bearer ${token}`)
    expect(shipFinished.status).toBe(409)
    expect(shipFinished.body.message).toBe('仅待发货订单可发货')

    // 待发货订单不可直接标记完成
    const finishPending = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/finish')
      .set('Authorization', `Bearer ${token}`)
    expect(finishPending.status).toBe(409)
    expect(finishPending.body.message).toBe('仅已发货订单可标记完成')

    // 已发货订单不可取消
    const cancelShipped = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2004/cancel')
      .set('Authorization', `Bearer ${token}`)
    expect(cancelShipped.status).toBe(409)
    expect(cancelShipped.body.message).toBe('仅待发货订单可取消')
  })

  it('发货 → 标记完成 链路', async () => {
    const ship = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/ship')
      .set('Authorization', `Bearer ${token}`)
    expect(ship.status).toBe(200)
    expect(ship.body.code).toBe(0)

    const afterShip = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'RO2003' })
    expect(afterShip.body.data.list[0].status).toBe('shipped')
    expect(afterShip.body.data.list[0].shippedAt).toBeTruthy()

    // 重复发货 → 409
    const shipAgain = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/ship')
      .set('Authorization', `Bearer ${token}`)
    expect(shipAgain.status).toBe(409)

    const finish = await request(app.getHttpServer())
      .post('/api/admin/mall/redemption-orders/RO2003/finish')
      .set('Authorization', `Bearer ${token}`)
    expect(finish.status).toBe(200)
    expect(finish.body.code).toBe(0)

    const afterFinish = await request(app.getHttpServer())
      .get('/api/admin/mall/redemption-orders')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 10, keyword: 'RO2003' })
    expect(afterFinish.body.data.list[0].status).toBe('finished')
    expect(afterFinish.body.data.list[0].finishedAt).toBeTruthy()
  })

  it('取消订单事务：退积分（source=redemption）+ 回补库存', async () => {
    // 重置种子，保证 RO2003 回到待发货、U1005 余额 600、G1002 库存 18
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
