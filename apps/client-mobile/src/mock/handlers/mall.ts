import type { Goods, MyOrder } from '@/types'
import { accountByUid, addressesByUid, appConfig, goods, goodsOffIds, grantPoints, nextMockId, nowStamp, ordersByUid, pushNotice, restockSubscriptions, trackMockEvent } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { formatMockStamp, mockNowMs } from '@/mock/runtime'

/* [MOCK-ONLY] 积分商城 handlers。下单事务语义：扣积分 + 写流水 + 扣库存 + 建单。
 * v34 履约模型：physical 待发货→已发货→确认收货；voucher 下单即发券码；service 待使用→核销。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

export async function fetchGoods(query: { category?: string } = {}): Promise<Goods[]> {
  return withLatency(() => {
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    return goods.filter((g) => !goodsOffIds.includes(g.id) && !(g.stock <= 0) && (!query.category || g.category === query.category))
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

export async function createOrder(goodsId: string, addressId?: string): Promise<{ id: string; remainingPoints: number }> {
  return withLatency(() => {
    const uid = requireUid()
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    const g = goods.find((x) => x.id === goodsId && !goodsOffIds.includes(x.id))
    if (!g) fail(404, '商品不存在或已下架')
    if (g.stock <= 0) fail(409, '商品库存不足')
    const account = accountByUid(uid)
    if (!account) fail(401, '未登录或登录已过期')
    if (account.points < g.pointsCost) fail(409, `积分不足，还差 ${g.pointsCost - account.points} 积分`)

    /* 事务语义（Mock）：扣积分 + 写流水 + 扣库存 + 建单（状态与通知按履约类型分流） */
    const id = nextMockId('RO')
    const orders = (ordersByUid[uid] ??= [])
    const base: Omit<MyOrder, 'status'> = { id, goodsId: g.id, goodsName: g.name, pointsCost: g.pointsCost, fulfillment: g.fulfillment, createdAt: nowStamp() }
    /* v38：实物订单必须带收货地址（缺省取默认地址） */
    if (g.fulfillment === 'physical') {
      const list = addressesByUid[uid] ?? []
      const addr = list.find((item) => item.id === addressId) ?? list.find((item) => item.isDefault) ?? list[0]
      if (!addr) fail(400, '请先添加收货地址')
      base.recipientName = addr.name
      base.recipientPhone = addr.phone
      base.recipientAddress = addr.address
    }
    if (g.fulfillment === 'voucher') {
      orders.unshift({
        ...base,
        status: 'completed',
        voucherCode: `JYV-${id.slice(2)}`,
        /* v38：券码 30 天有效 */
        voucherExpiresAt: formatMockStamp(mockNowMs() + 30 * 24 * 60 * 60 * 1000),
        finishedAt: nowStamp(),
      })
      pushNotice(uid, { type: 'order', title: '兑换成功，券码已发放', content: `「${g.name}」券码已生成，可在我的订单查看。`, link: '/me/orders' })
    } else if (g.fulfillment === 'service') {
      orders.unshift({ ...base, status: 'pending_use' })
      pushNotice(uid, { type: 'order', title: '兑换成功，待使用', content: `「${g.name}」兑换成功，使用时请在订单中核销。`, link: '/me/orders' })
    } else {
      orders.unshift({ ...base, status: 'pending_shipment' })
      pushNotice(uid, { type: 'order', title: '兑换成功，待发货', content: `「${g.name}」兑换成功，将寄往 ${base.recipientAddress ?? '默认地址'}。`, link: '/me/orders' })
    }
    g.stock -= 1
    grantPoints(uid, -g.pointsCost, `积分商城兑换：${g.name}`, '商城兑换')
    trackMockEvent('order_create')
    return { id, remainingPoints: account.points }
  })
}

export async function fetchMyOrders(): Promise<MyOrder[]> {
  return withLatency(() => {
    const uid = requireUid()
    return [...(ordersByUid[uid] ?? [])]
  })
}

/** [MOCK-ONLY] devtools：模拟后台发货（实物订单 pending_shipment → shipped）；确认收货走 confirmOrder */
export async function advanceOrder(id: string): Promise<void> {
  await withLatency(() => {
    const uid = readPayload()?.sub ?? ''
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.fulfillment !== 'physical' || order.status !== 'pending_shipment') return
    order.status = 'shipped'
    order.shippedAt = nowStamp()
    /* v40：模拟后台发货写入物流单号 */
    order.trackingNo = `SF${order.id.slice(2)}`
    pushNotice(uid, { type: 'order', title: '兑换订单已发货', content: `「${order.goodsName}」已寄出（${order.trackingNo}），请注意查收。`, link: '/me/orders' })
  }, 120)
}

/** 确认收货：实物订单 shipped → completed（缺口 §7.1-10；接入期接 POST /api/app/mall/orders/:id/confirm） */
export async function confirmOrder(id: string): Promise<void> {
  return withLatency(() => {
    const uid = requireUid()
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.fulfillment !== 'physical') fail(409, '该订单为虚拟权益，无需确认收货')
    if (order.status !== 'shipped') fail(409, '当前订单不可确认收货')
    order.status = 'completed'
    order.finishedAt = nowStamp()
    pushNotice(uid, { type: 'order', title: '订单已完成', content: `「${order.goodsName}」已确认收货，感谢兑换。`, link: '/me/orders' })
  }, 160)
}

/** v41 订单评价：完成订单 1~5 星 + 可选文字（每单一次） */
export async function reviewOrder(id: string, rating: number, review?: string): Promise<void> {
  return withLatency(() => {
    const uid = requireUid()
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.status !== 'completed') fail(409, '订单完成后才能评价')
    if (order.rating) fail(409, '该订单已评价')
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, '请选择 1~5 星评分')
    order.rating = rating
    order.review = review?.trim() || undefined
    order.reviewedAt = nowStamp()
    pushNotice(uid, { type: 'order', title: '评价已提交', content: `感谢你对「${order.goodsName}」的评价。`, link: '/me/orders' })
  }, 200)
}

/** 服务权益核销：service pending_use → completed */
export async function useOrder(id: string): Promise<void> {
  return withLatency(() => {
    const uid = requireUid()
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.fulfillment !== 'service') fail(409, '该订单为实物或券码，无需核销')
    if (order.status !== 'pending_use') fail(409, '当前订单不可核销')
    order.status = 'completed'
    order.usedAt = nowStamp()
    order.finishedAt = nowStamp()
    pushNotice(uid, { type: 'order', title: '权益已核销', content: `「${order.goodsName}」已使用，感谢兑换。`, link: '/me/orders' })
  }, 160)
}

/** [MOCK-ONLY] v38 用户取消待发货订单：退积分 + 回补库存（已发货不可取消）。 */
export async function cancelOrder(id: string): Promise<void> {
  return withLatency(() => {
    const uid = requireUid()
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.fulfillment !== 'physical') fail(409, '虚拟权益订单暂不支持取消')
    if (order.status !== 'pending_shipment') fail(409, '当前订单不可取消，请联系社区运营')
    order.status = 'cancelled'
    order.cancelledAt = nowStamp()
    const g = goods.find((x) => x.id === order.goodsId)
    if (g) g.stock += 1
    grantPoints(uid, order.pointsCost, `取消兑换退款：${order.goodsName}`, '商城退款')
    pushNotice(uid, { type: 'order', title: '订单已取消，积分已退回', content: `「${order.goodsName}」已取消，${order.pointsCost} 积分已退回。`, link: '/me/orders' })
  }, 160)
}

/** [MOCK-ONLY] v37 到货提醒：缺货商品订阅，补货后由运营/调度通知（Mock 记录订阅）。 */
export async function subscribeRestock(goodsId: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const g = goods.find((x) => x.id === goodsId && !goodsOffIds.includes(x.id))
    if (!g) fail(404, '商品不存在或已下架')
    if (g.stock > 0) fail(409, '商品当前有货，无需补货提醒')
    const list = (restockSubscriptions[uid] ??= [])
    if (list.includes(goodsId)) fail(409, '已订阅该商品的到货提醒')
    list.push(goodsId)
    pushNotice(uid, { type: 'system', title: '到货提醒已开启', content: `「${g.name}」补货后将第一时间通知你。`, link: '/mall' })
    trackMockEvent('restock_subscribe')
  }, 140)
}
