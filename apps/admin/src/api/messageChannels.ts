import type { MessageChannel, MessageChannelCatalog, MessageChannelPayload } from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

/* 消息中心 · 渠道配置（P0）：凭据只以环境变量名登记，接口不回传凭据值。 */

export async function fetchMessageChannelCatalog(): Promise<MessageChannelCatalog> {
  return httpGet<MessageChannelCatalog>('/message-channels/catalog')
}

export async function fetchMessageChannels(): Promise<MessageChannel[]> {
  return httpGet<MessageChannel[]>('/message-channels')
}

/* PUT /api/admin/message-channels — 按 kind+provider 新增或更新（幂等）
 * 凭据来源：inline 直接填写（只写，留空保持原值）| env 登记环境变量名（缺省 env） */
export async function saveMessageChannel(payload: MessageChannelPayload): Promise<{ id: string }> {
  return httpPut<{ id: string }>('/message-channels', payload)
}

export async function toggleMessageChannel(id: string, enabled: boolean): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/message-channels/${id}/enabled`, { enabled })
}

export interface TestSendPayload {
  recipient: string
  templateCode?: string
  variables?: Record<string, string>
  body?: string
  subject?: string
}

/* POST /api/admin/message-channels/:id/test-send — 测试发送（不写发送队列） */
export async function testSendMessageChannel(
  id: string,
  payload: TestSendPayload,
): Promise<{ providerMessageId?: string; dryRun: boolean; costMs: number }> {
  return httpPost<{ providerMessageId?: string; dryRun: boolean; costMs: number }>(
    `/message-channels/${id}/test-send`,
    payload,
  )
}
