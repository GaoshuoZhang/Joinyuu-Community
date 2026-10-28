import { DEFAULT_LIST_PAGE_SIZE, httpGet, httpPost } from './http'
import type {
  CommerceBillList,
  CommerceCapabilities,
  CommerceOrder,
  CommercePaymentLaunch,
  CommercePayMethod,
  CommerceQuote,
  CommerceQuotePayload,
  CommerceRefundRequest,
  CommerceTransactionQuery,
  CommerceTransactionSummary,
  PageResult,
} from '@/types'

/** GET /api/app/commerce/capabilities — 当前环境可用支付方式与模块开关 */
export function fetchPaymentCapabilities(): Promise<CommerceCapabilities> {
  return httpGet<CommerceCapabilities>('/commerce/capabilities')
}

/** POST /api/app/commerce/quotes — 后端计算价格并冻结政策快照 */
export function createQuote(payload: CommerceQuotePayload): Promise<CommerceQuote> {
  return httpPost<CommerceQuote>('/commerce/quotes', payload)
}

/** GET /api/app/commerce/quotes/:id — 确认页重新读取报价（过期/已消费状态以服务端为准） */
export function fetchQuote(id: string): Promise<CommerceQuote> {
  return httpGet<CommerceQuote>(`/commerce/quotes/${id}`)
}

/** POST /api/app/commerce/orders — 从报价创建/复用待付款订单并占用资源 */
export function createCommerceOrder(quoteId: string): Promise<CommerceOrder> {
  return httpPost<CommerceOrder>('/commerce/orders', { quoteId })
}

/** GET /api/app/commerce/orders/:id — 收银台/结果页/详情读取 */
export function fetchCommerceOrder(id: string): Promise<CommerceOrder> {
  return httpGet<CommerceOrder>(`/commerce/orders/${id}`)
}

/** POST /api/app/commerce/orders/:id/payments — 发起或复用微信支付 */
export function startOrderPayment(orderId: string, method?: CommercePayMethod): Promise<CommercePaymentLaunch> {
  return httpPost<CommercePaymentLaunch>(`/commerce/orders/${orderId}/payments`, method ? { method } : {})
}

/** POST /api/app/commerce/payments/:id/sync — 查询原支付结果（不写成功状态） */
export function syncOrderPayment(paymentId: string): Promise<CommerceOrder> {
  return httpPost<CommerceOrder>(`/commerce/payments/${paymentId}/sync`)
}

/** POST /api/app/commerce/orders/:id/cancel — 取消未付款订单并释放占用 */
export function cancelCommerceOrder(orderId: string): Promise<CommerceOrder> {
  return httpPost<CommerceOrder>(`/commerce/orders/${orderId}/cancel`)
}

/** POST /api/app/commerce/orders/:id/wechat-authorize — 获取一次性网页授权链接 */
export function fetchWechatAuthorizeUrl(orderId: string): Promise<{ url: string }> {
  return httpPost<{ url: string }>(`/commerce/orders/${orderId}/wechat-authorize`)
}

/** GET /api/app/me/transactions — 我的现金交易 */
export function fetchTransactions(query: CommerceTransactionQuery = {}): Promise<PageResult<CommerceOrder>> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? DEFAULT_LIST_PAGE_SIZE
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (query.status && query.status !== 'all') qs.set('status', query.status)
  if (query.sourceType) qs.set('sourceType', query.sourceType)
  return httpGet<PageResult<CommerceOrder>>(`/me/transactions?${qs}`)
}

/** GET /api/app/me/transactions/summary — 待付款/退款处理中/待缴账单数量 */
export function fetchTransactionSummary(): Promise<CommerceTransactionSummary> {
  return httpGet<CommerceTransactionSummary>('/me/transactions/summary')
}

/** GET /api/app/me/bills — 本人或负责企业可缴的租约账单 */
export function fetchMyBills(query: { page?: number; pageSize?: number } = {}): Promise<CommerceBillList> {
  const qs = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? DEFAULT_LIST_PAGE_SIZE) })
  return httpGet<CommerceBillList>(`/me/bills?${qs}`)
}

/** POST /api/app/commerce/bills/:id/orders — 从已出账单形成缴费单（不重复出账） */
export function createBillOrder(billId: string): Promise<CommerceOrder> {
  return httpPost<CommerceOrder>(`/commerce/bills/${billId}/orders`)
}

/** POST /api/app/commerce/orders/:id/refund-requests — 首期整单全额退款申请 */
export function requestOrderRefund(orderId: string, reason: string): Promise<{ id: string; status: string; amountFen: number }> {
  return httpPost<{ id: string; status: string; amountFen: number }>(`/commerce/orders/${orderId}/refund-requests`, { reason })
}

/** GET /api/app/commerce/refund-requests/:id — 售后进度 */
export function fetchRefundRequest(id: string): Promise<CommerceRefundRequest> {
  return httpGet<CommerceRefundRequest>(`/commerce/refund-requests/${id}`)
}
