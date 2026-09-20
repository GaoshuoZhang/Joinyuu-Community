import type { OutboxDeliveryLog, OutboxListResult, OutboxStatus } from '@/types'
import { httpGet, httpPost } from './http'

/* 消息中心 · 发送记录（P0 Outbox）：状态/失败原因/投递日志/手动重试与终止。 */

export interface OutboxQuery {
  page?: number
  pageSize?: number
  status?: OutboxStatus | ''
  channelKind?: string
  keyword?: string
}

export async function fetchOutboxMessages(query: OutboxQuery = {}): Promise<OutboxListResult> {
  const params = new URLSearchParams()
  params.set('page', String(query.page ?? 1))
  params.set('pageSize', String(query.pageSize ?? 20))
  if (query.status) params.set('status', query.status)
  if (query.channelKind) params.set('channelKind', query.channelKind)
  if (query.keyword) params.set('keyword', query.keyword)
  return httpGet<OutboxListResult>(`/outbox?${params.toString()}`)
}

export async function fetchOutboxLogs(id: string): Promise<OutboxDeliveryLog[]> {
  return httpGet<OutboxDeliveryLog[]>(`/outbox/${id}/logs`)
}

export async function retryOutboxMessage(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/outbox/${id}/retry`)
}

export async function discardOutboxMessage(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/outbox/${id}/discard`)
}
