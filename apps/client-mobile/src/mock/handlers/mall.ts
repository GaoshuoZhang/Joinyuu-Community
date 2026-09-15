import type { Goods, MyOrder } from '@/types'
import { accountByUid, appConfig, goods, goodsOffIds, grantPoints, nowStamp, ordersByUid, pushNotice } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] 积分商城 handlers。下单事务语义：扣积分 + 写流水 + 扣库存 + 建单 pending_shipment + 通知。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchGoods(): Promise<Goods[]> {
  return withLatency(() => {
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    return goods.filter((g) => !goodsOffIds.includes(g.id) && !(g.stock <= 0))
  })
}

export async function fetchGoodsDetail(id: string): Promise<Goods> {
  return withLatency(() => {
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    const g = goods.find((x) => x.id === id && !goodsOffIds.includes(x.id))
    if (!g) fail(404, '商品不存在或已下架')
    return g
  })
}

export async function createOrder(goodsId: string): Promise<{ id: string; remainingPoints: number }> {
  return withLatency(() => {
    const uid = requireUid()
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    const g = goods.find((x) => x.id === goodsId && !goodsOffIds.includes(x.id))
    if (!g) fail(404, '商品不存在或已下架')
    if (g.stock <= 0) fail(409, '商品库存不足')
    const account = accountByUid(uid)
    if (!account) fail(401, '未登录或登录已过期')
    if (account.points < g.pointsCost) fail(409, `积分不足，还差 ${g.pointsCost - account.points} 积分`)

    /* 事务语义（Mock）：扣积分 + 写流水 + 扣库存 + 建单 */
    const id = `RO${Date.now()}`
    ;(ordersByUid[uid] ??= []).unshift({
      id, goodsId: g.id, goodsName: g.name, pointsCost: g.pointsCost,
      status: 'pending_shipment', createdAt: nowStamp(),
    })
    g.stock -= 1
    grantPoints(uid, -g.pointsCost, `积分商城兑换：${g.name}`, '商城兑换')
    /* [MOCK-ONLY] 通知触发点：下单成功（待发货） */
    pushNotice(uid, { type: 'order', title: '兑换成功，待发货', content: `「${g.name}」兑换成功，我们将尽快安排发货。`, link: '/me/orders' })
    return { id, remainingPoints: account.points }
  })
}

export async function fetchMyOrders(): Promise<MyOrder[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(ordersByUid[uid] ?? [])]
  })
}

/** [MOCK-ONLY] devtools：模拟后台发货（pending_shipment → shipped）；用户确认收货走 confirmOrder */
export async function advanceOrder(id: string): Promise<void> {
  await withLatency(() => {
    const uid = readPayload()?.sub ?? ''
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.status !== 'pending_shipment') return
    order.status = 'shipped'
    order.shippedAt = nowStamp()
    pushNotice(uid, { type: 'order', title: '兑换订单已发货', content: `「${order.goodsName}」已寄出，请注意查收。`, link: '/me/orders' })
  }, 120)
}

/** 确认收货：shipped → completed（缺口 §7.1-10；接入期接 POST /api/app/mall/orders/:id/confirm） */
export async function confirmOrder(id: string): Promise<void> {
  return withLatency(() => {
    const uid = requireUid()
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.status !== 'shipped') fail(409, '当前订单不可确认收货')
    order.status = 'completed'
    order.finishedAt = nowStamp()
    pushNotice(uid, { type: 'order', title: '订单已完成', content: `「${order.goodsName}」已确认收货，感谢兑换。`, link: '/me/orders' })
  }, 160)
}
