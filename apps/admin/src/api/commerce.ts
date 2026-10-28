import { httpGet, httpPost } from './http'

export const commerceModules = [
  { value: 'demand', label: '需求服务' }, { value: 'project', label: '项目' }, { value: 'lease', label: '办公位租约' },
  { value: 'space', label: '空间' }, { value: 'event', label: '活动' }, { value: 'mall', label: '商城' },
]
export const billableModules = commerceModules.filter(item => !['demand', 'project'].includes(item.value))
export const moduleLabel = (value: string) => commerceModules.find(x => x.value === value)?.label ?? value
export const money = (fen: number) => `¥${(fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export function parseFen(value: string): number {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('请输入最多两位小数的正数金额')
  const [yuan, fraction = ''] = value.split('.')
  const fen = Number(yuan) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(fen) || fen < 1 || fen > 100_000_000) throw new Error('金额须在 0.01 至 1,000,000.00 元之间')
  return fen
}
export interface ChargeService { id: string; name: string; module: string; amountFen: number; description: string; refundPolicy: string; status: string; version: number }
export interface CommerceReceipt { id: string; reference: string; amountFen: number; note: string; status: string; createdBy: string; reviewedBy?: string }
export interface CommerceRefund { id: string; amountFen: number; reason: string; status: string; lastError?: string; createdBy: string }
export interface CommercePayment { id: string; status: string; amountFen: number; transactionId?: string; expiresAt: string; lastError?: string; refunds?: CommerceRefund[] }
export interface CommerceBill { id: string; module: string; sourceId: string; sourceName: string; buyerType: string; buyerId: string; buyerName: string; title: string; period: string; amountFen: number; paidFen: number; refundedFen: number; dueDate: string; status: string; overdue?: boolean; snapshot: { agreement: string; service?: ChargeService; pricing?: { unitAmountFen: number; quantity: number; unit: string; refundPolicy: string } }; payments?: CommercePayment[]; receipts?: CommerceReceipt[] }
export interface CommerceOverview { paidFen: number; refundedFen: number; unpaidFen: number; unpaidCount: number; overdueCount: number; pendingReceipts: number; pendingPayments: number }
export interface CommerceCapabilities { ready: boolean; enabled: boolean; missing: string[] }
function params(query: object) {
  return new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)])).toString()
}
export const fetchCommerceBills = (q: object) => httpGet<{ list: CommerceBill[]; total: number }>(`/commerce/bills?${params(q)}`)
export const fetchCommerceBill = (id: string) => httpGet<CommerceBill>(`/commerce/bills/${id}`)
export const createCommerceBill = (body: object) => httpPost<CommerceBill>('/commerce/bills', body)
export const fetchCommerceOptions = (kind: 'sources' | 'buyers', q: object) => httpGet<Array<{ id: string; name: string }>>(`/commerce/${kind}?${params(q)}`)
export const fetchCommerceOverview = () => httpGet<CommerceOverview>('/commerce/overview')
export const fetchCommerceCapabilities = () => httpGet<CommerceCapabilities>('/commerce/capabilities')
export const commerceAction = (path: string, body?: object) => httpPost(`/commerce/${path}`, body)
export const createNativePayment = (id: string) => httpPost<{ id: string; code_url: string; expiresAt: string }>(`/commerce/bills/${id}/native-payment`)

export interface CommerceSourcePrice { id: string; name: string; amountFen: number; unit: string; refundPolicy: string }
export const fetchCommerceSourcePrice = (module: string, id: string) => httpGet<CommerceSourcePrice>(`/commerce/sources/${id}?module=${module}`)
