import { apiMode, httpGet, httpPost } from './http'
import type { Goods, MyOrder } from '@/types'
import * as mock from '@/mock/handlers/mall'

/** GET /api/app/mall/goods — 商品列表（on 且库存>0；mallOpen 关闭 → 400） */
export async function fetchGoods(): Promise<Goods[]> {
  if (apiMode === 'mock') return mock.fetchGoods()
  return httpGet<Goods[]>('/mall/goods')
}

/** GET /api/app/mall/goods/:id — 商品详情 */
export async function fetchGoodsDetail(id: string): Promise<Goods> {
  if (apiMode === 'mock') return mock.fetchGoodsDetail(id)
  return httpGet<Goods>(`/mall/goods/${id}`)
}

/** POST /api/app/mall/orders — 兑换下单（事务：扣积分 + 流水 + 扣库存 + 建单 pending_shipment） */
export async function createOrder(goodsId: string): Promise<{ id: string; remainingPoints: number }> {
  if (apiMode === 'mock') return mock.createOrder(goodsId)
  return httpPost<{ id: string; remainingPoints: number }>('/mall/orders', { goodsId })
}

/** GET /api/app/me/orders — 我的兑换订单 */
export async function fetchMyOrders(): Promise<MyOrder[]> {
  if (apiMode === 'mock') return mock.fetchMyOrders()
  return httpGet<MyOrder[]>('/me/orders')
}

/** [MOCK-ONLY] devtools 订单状态推进（模拟后台发货；接入后为管理端能力，缺口 §7.2-3） */
export async function mockAdvanceOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return mock.advanceOrder(id)
}
