import type { Goods, MyOrder } from '@/types'
import { accountByUid, addressesByUid, appConfig, goods, goodsOffIds, grantPoints, nextMockId, nowStamp, ordersByUid, pushNotice, restockSubscriptions, trackMockEvent } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'
import { formatMockStamp, mockNowMs } from '@/mock/runtime'

/* [MOCK-ONLY] 积分商城 handlers。下单事务语义：校验库存→扣积分+流水→扣库存→建单（与后端 AppMallService.createOrder 一致）。
 * 履约模型：physical 待发货→已发货→确认收货；voucher 下单即发券码，待使用→核销；券码过期由 fetchMyOrders 派生 expired。 */

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

/** 同一用户同一商品 3 秒内重复提交去重（对齐后端 Redis acquireFlag） */
const ORDER_DEDUPE_TTL_MS = 3000
const orderDedupe = new Map<string, number>()

export async function fetchGoods(query: { category?: string } = {}): Promise<Goods[]> {
  return withLatency(() => {
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    return goods.filter((g) => g.status === 'on' && g.stock > 0 && !goodsOffIds.includes(g.id) && (!query.category || g.category === query.category))
  })
}

export async function fetchGoodsDetail(id: string): Promise<Goods> {
  return withLatency(() => {
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    const g = goods.find((x) => x.id === id && x.status === 'on' && x.stock > 0)
    if (!g) fail(404, '商品不存在')
    return g
  })
}

export async function createOrder(goodsId: string, addressId?: string): Promise<{ id: string; remainingPoints: number }> {
  return withLatency(() => {
    const uid = requireUid()
    if (!appConfig.mallOpen) fail(400, '积分商城暂未开放')
    const g = goods.find((x) => x.id === goodsId)
    if (!g || g.status !== 'on') fail(404, '商品不存在')
    const account = accountByUid(uid)
    if (!account) fail(401, '未登录或登录已过期')
    if (account.points < g.pointsCost) fail(400, `积分不足，还差 ${g.pointsCost - account.points} 积分`)

    /* v38：实物订单必须带收货地址（与后端一致，不做默认地址兜底） */
    let address: { name: string; phone: string; address: string } | undefined
    if (g.fulfillment === 'physical') {
      const addr = addressId ? (addressesByUid[uid] ?? []).find((item) => item.id === addressId) : undefined
      if (!addr) fail(400, '请先选择收货地址')
      address = { name: addr.name, phone: addr.phone, address: addr.address }
    }

    const dedupeKey = `${uid}:${g.id}`
    const lastAt = orderDedupe.get(dedupeKey) ?? 0
    if (Date.now() - lastAt < ORDER_DEDUPE_TTL_MS) fail(409, '请勿重复提交')
    orderDedupe.set(dedupeKey, Date.now())

    try {
      /* 事务语义（Mock）：库存扣减先行，再复核并扣积分+写流水+建单 */
      if (g.stock <= 0) fail(400, '库存不足')
      g.stock -= 1
      if (account.points < g.pointsCost) fail(400, '积分不足')

      const id = nextMockId('RO')
      const orders = (ordersByUid[uid] ??= [])
      const base: Omit<MyOrder, 'status'> = { id, goodsId: g.id, goodsName: g.name, pointsCost: g.pointsCost, fulfillment: g.fulfillment, createdAt: nowStamp() }
      if (address) {
        base.recipientName = address.name
        base.recipientPhone = address.phone
        base.recipientAddress = address.address
      }
      if (g.fulfillment === 'voucher') {
        orders.unshift({
          ...base,
          status: 'pending_use',
          voucherCode: `JYV-${id.slice(2)}`,
          /* v38：券码 30 天有效 */
          voucherExpiresAt: formatMockStamp(mockNowMs() + 30 * 24 * 60 * 60 * 1000),
        })
        pushNotice(uid, { type: 'order', title: '兑换成功，券码已发放', content: `「${g.name}」券码已生成，可在我的订单查看。`, link: '/me/orders' })
      } else {
        orders.unshift({ ...base, status: 'pending_shipment' })
        pushNotice(uid, { type: 'order', title: '兑换成功，待发货', content: `「${g.name}」兑换成功，将寄往 ${base.recipientAddress ?? '默认地址'}。`, link: '/me/orders' })
      }
      grantPoints(uid, -g.pointsCost, `积分商城兑换：${g.name}`, '商城兑换')
      trackMockEvent('order_create')
      return { id, remainingPoints: account.points }
    } catch (error) {
      orderDedupe.delete(dedupeKey)
      throw error
    }
  })
}

export async function fetchMyOrders(): Promise<MyOrder[]> {
  return withLatency(() => {
    const uid = requireUid()
    const at = nowStamp()
    /* 券码过期派生：pending_use 且 voucherExpiresAt 已过 → expired（不可核销） */
    return (ordersByUid[uid] ?? []).map((order) => (
      order.status === 'pending_use' && order.voucherExpiresAt && order.voucherExpiresAt <= at
        ? { ...order, status: 'expired' as const }
        : { ...order }
    ))
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
    if (order.status !== 'shipped') fail(409, '仅已发货订单可确认收货')
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
    if (order.status !== 'completed') fail(409, '仅已完成的订单可评价')
    if (order.rating) fail(409, '该订单已评价')
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, '请选择 1~5 星评分')
    order.rating = rating
    order.review = review?.trim() || undefined
    order.reviewedAt = nowStamp()
    pushNotice(uid, { type: 'order', title: '评价已提交', content: `感谢你对「${order.goodsName}」的评价。`, link: '/me/orders' })
  }, 200)
}

/** 权益券核销：voucher pending_use → completed（券码过期不可核销） */
export async function useOrder(id: string): Promise<void> {
  return withLatency(() => {
    const uid = requireUid()
    const order = (ordersByUid[uid] ?? []).find((o) => o.id === id)
    if (!order) fail(404, '订单不存在')
    if (order.status !== 'pending_use') fail(409, '该订单不可核销')
    if (order.fulfillment === 'voucher' && order.voucherExpiresAt && order.voucherExpiresAt <= nowStamp()) fail(409, '券码已过期，无法核销')
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
    if (order.fulfillment !== 'physical') fail(409, '该订单不可取消')
    if (order.status !== 'pending_shipment') fail(409, '仅待发货订单可取消')
    order.status = 'cancelled'
    order.cancelledAt = nowStamp()
    const g = goods.find((x) => x.id === order.goodsId)
    if (g) {
      g.stock += 1
      /* 补货状态商品回补库存后恢复上架（对齐后端取消订单逻辑） */
      if (g.status === 'restock' && g.stock > 0) g.status = 'off'
    }
    grantPoints(uid, order.pointsCost, `取消兑换退款：${order.goodsName}`, '商城退款')
    pushNotice(uid, { type: 'order', title: '订单已取消，积分已退回', content: `「${order.goodsName}」已取消，${order.pointsCost} 积分已退回。`, link: '/me/orders' })
  }, 160)
}

/** [MOCK-ONLY] v37 到货提醒：缺货或补货中商品可订阅，补货后由运营/调度通知（Mock 记录订阅）。 */
export async function subscribeRestock(goodsId: string): Promise<void> {
  await withLatency(() => {
    const uid = requireUid()
    const g = goods.find((x) => x.id === goodsId)
    if (!g) fail(404, '商品不存在')
    if (g.stock > 0 && g.status !== 'restock') fail(400, '该商品尚有库存，无需到货提醒')
    const list = (restockSubscriptions[uid] ??= [])
    if (list.includes(goodsId)) return
    list.push(goodsId)
    pushNotice(uid, { type: 'system', title: '到货提醒已开启', content: `「${g.name}」补货后将第一时间通知你。`, link: '/mall' })
    trackMockEvent('restock_subscribe')
  }, 140)
}
