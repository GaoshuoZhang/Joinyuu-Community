import { DEFAULT_LIST_PAGE_SIZE, httpGet, httpPost } from './http'
import type { Goods, MyOrder, PageResult } from '@/types'

/** GET /api/app/mall/goods — 商品列表（on/restock 均可见，库存 0 展示售罄；mallOpen 关闭 → 400） */
export async function fetchGoods(query: { category?: string; page?: number; pageSize?: number; keyword?: string } = {}): Promise<PageResult<Goods>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (query.category) qs.set('category', query.category)
  if (query.keyword) qs.set('keyword', query.keyword)
  return httpGet<PageResult<Goods>>(`/mall/goods?${qs}`)
}

/** GET /api/app/mall/goods/:id — 商品详情 */
export async function fetchGoodsDetail(id: string): Promise<Goods> {
  return httpGet<Goods>(`/mall/goods/${id}`)
}

/** POST /api/app/mall/orders — 兑换下单（统一券码：事务扣积分 + 流水 + 扣库存 + 建单并签发券码） */
export async function createOrder(payload: { goodsId: string; remark?: string }): Promise<{ id: string; remainingPoints: number }> {
  return httpPost<{ id: string; remainingPoints: number }>('/mall/orders', payload)
}

/** GET /api/app/me/orders — 我的兑换订单 */
export async function fetchMyOrders(query: { page?: number; pageSize?: number; status?: string } = {}): Promise<PageResult<MyOrder>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (query.status) qs.set('status', query.status)
  return httpGet<PageResult<MyOrder>>(`/me/orders?${qs}`)
}

/** GET /api/app/me/orders/:id — 我的兑换订单详情（非本人/不存在 → 404） */
export async function fetchMyOrder(id: string): Promise<MyOrder> {
  return httpGet<MyOrder>(`/me/orders/${id}`)
}

/** POST /api/app/mall/orders/:id/review — 完成订单评价（1~5 星 + 可选文字） */
export async function reviewOrder(id: string, rating: number, review?: string): Promise<void> {
  await httpPost(`/mall/orders/${id}/review`, { rating, comment: review })
}

/** POST /api/app/mall/orders/:id/cancel — 退款（仅待使用券可退：退积分 + 回补库存）。
 * 核销由后台工作人员现场执行，用户侧不提供核销入口。 */
export async function cancelOrder(id: string): Promise<void> {
  await httpPost(`/mall/orders/${id}/cancel`)
}
