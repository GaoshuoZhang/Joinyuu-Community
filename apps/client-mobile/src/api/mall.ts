import { apiMode, httpGet, httpPost } from './http'
import type { Goods, MyOrder } from '@/types'
import * as mock from '@/mock/handlers/mall'

/** GET /api/app/mall/goods — 商品列表（on 且库存>0；mallOpen 关闭 → 400） */
export async function fetchGoods(query: { category?: string } = {}): Promise<Goods[]> {
  if (apiMode === 'mock') return mock.fetchGoods(query)
  const qs = query.category ? `?category=${encodeURIComponent(query.category)}` : ''
  return (await httpGet<{ list: Goods[]; total: number }>(`/mall/goods${qs}`)).list
}

/** GET /api/app/mall/goods/:id — 商品详情 */
export async function fetchGoodsDetail(id: string): Promise<Goods> {
  if (apiMode === 'mock') return mock.fetchGoodsDetail(id)
  return httpGet<Goods>(`/mall/goods/${id}`)
}

/** POST /api/app/mall/orders — 兑换下单（事务：扣积分 + 流水 + 扣库存 + 建单） */
export async function createOrder(goodsId: string, addressId?: string): Promise<{ id: string; remainingPoints: number }> {
  if (apiMode === 'mock') return mock.createOrder(goodsId, addressId)
  return httpPost<{ id: string; remainingPoints: number }>('/mall/orders', { goodsId, addressId })
}

/** GET /api/app/me/orders — 我的兑换订单 */
export async function fetchMyOrders(): Promise<MyOrder[]> {
  if (apiMode === 'mock') return mock.fetchMyOrders()
  return (await httpGet<{ list: MyOrder[]; total: number }>('/me/orders')).list
}

/** POST /api/app/mall/orders/:id/confirm — 确认收货（实物 shipped → completed；缺口 §7.1-10 待补契约） */
/** POST /api/app/mall/orders/:id/review — 完成订单评价（1~5 星 + 可选文字） */
export async function reviewOrder(id: string, rating: number, review?: string): Promise<void> {
  if (apiMode === 'mock') return mock.reviewOrder(id, rating, review)
  await httpPost(`/mall/orders/${id}/review`, { rating, comment: review })
}

export async function confirmOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.confirmOrder(id)
  await httpPost(`/mall/orders/${id}/confirm`)
}

/** [MOCK-ONLY] 服务权益核销（service pending_use → completed）。 */
export async function useOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.useOrder(id)
  await httpPost(`/mall/orders/${id}/use`)
}

/** [MOCK-ONLY] 缺货商品到货提醒订阅。 */
export async function subscribeRestock(goodsId: string): Promise<void> {
  if (apiMode === 'mock') return mock.subscribeRestock(goodsId)
  await httpPost(`/mall/goods/${goodsId}/restock-subscribe`)
}

/** [MOCK-ONLY] v38 取消待发货订单（退积分 + 回补库存）。 */
export async function cancelOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.cancelOrder(id)
  await httpPost(`/mall/orders/${id}/cancel`)
}

/** [MOCK-ONLY] devtools：模拟后台发货（pending_shipment → shipped；接入后为管理端能力，缺口 §7.2-3） */
export async function mockAdvanceOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.advanceOrder(id)
}
