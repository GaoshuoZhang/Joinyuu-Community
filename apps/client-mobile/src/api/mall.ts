import { DEFAULT_LIST_PAGE_SIZE, apiMode, httpGet, httpPost } from './http'
import type { Goods, MyOrder, PageResult } from '@/types'

/** GET /api/app/mall/goods — 商品列表（on/restock 均可见，库存 0 展示售罄；mallOpen 关闭 → 400） */
export async function fetchGoods(query: { category?: string; page?: number; pageSize?: number } = {}): Promise<PageResult<Goods>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).fetchGoods({ ...query, page, pageSize })
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (query.category) qs.set('category', query.category)
  return httpGet<PageResult<Goods>>(`/mall/goods?${qs}`)
}

/** GET /api/app/mall/goods/:id — 商品详情 */
export async function fetchGoodsDetail(id: string): Promise<Goods> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).fetchGoodsDetail(id)
  return httpGet<Goods>(`/mall/goods/${id}`)
}

/** POST /api/app/mall/orders — 兑换下单（事务：扣积分 + 流水 + 扣库存 + 建单） */
export async function createOrder(goodsId: string, addressId?: string): Promise<{ id: string; remainingPoints: number }> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).createOrder(goodsId, addressId)
  return httpPost<{ id: string; remainingPoints: number }>('/mall/orders', { goodsId, addressId })
}

/** GET /api/app/me/orders — 我的兑换订单 */
export async function fetchMyOrders(query: { page?: number; pageSize?: number } = {}): Promise<PageResult<MyOrder>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).fetchMyOrders({ ...query, page, pageSize })
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  return httpGet<PageResult<MyOrder>>(`/me/orders?${qs}`)
}

/** POST /api/app/mall/orders/:id/confirm — 确认收货（实物 shipped → completed）。 */
/** POST /api/app/mall/orders/:id/review — 完成订单评价（1~5 星 + 可选文字） */
export async function reviewOrder(id: string, rating: number, review?: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).reviewOrder(id, rating, review)
  await httpPost(`/mall/orders/${id}/review`, { rating, comment: review })
}

export async function confirmOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).confirmOrder(id)
  await httpPost(`/mall/orders/${id}/confirm`)
}

/** 权益券核销（voucher pending_use → completed）。 */
export async function useOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).useOrder(id)
  await httpPost(`/mall/orders/${id}/use`)
}

/** 取消待发货订单（退积分 + 回补库存）。 */
export async function cancelOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).cancelOrder(id)
  await httpPost(`/mall/orders/${id}/cancel`)
}

/** [MOCK-ONLY] DevTools 模拟后台发货；真实发货由管理端完成。 */
export async function mockAdvanceOrder(id: string): Promise<void> {
  if (apiMode === 'mock') return (await import('@/mock/handlers/mall')).advanceOrder(id)
}
