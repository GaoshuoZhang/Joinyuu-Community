import type { MessageChannel, MessageChannelCatalog, MessageChannelPayload } from '@/types'
import { httpGet, httpPatch, httpPost, httpPut } from './http'

/* 消息中心 · 渠道配置：凭据支持只写密钥或环境变量名，接口不回传原文。 */

export async function fetchMessageChannelCatalog(): Promise<MessageChannelCatalog> {
  return httpGet<MessageChannelCatalog>('/message-channels/catalog')
}

export async function fetchMessageChannels(): Promise<MessageChannel[]> {
  return httpGet<MessageChannel[]>('/message-channels')
}

/* POST 新增，PUT /:id 编辑；新增时遇到同一 kind+provider 必须拒绝覆盖。
 * 凭据来源：inline 直接填写（只写，留空保持原值）| env 登记环境变量名（缺省 env） */
export async function saveMessageChannel(payload: MessageChannelPayload, id?: string): Promise<{ id: string }> {
  return id ? httpPut<{ id: string }>(`/message-channels/${id}`, payload)
    : httpPost<{ id: string }>('/message-channels', payload)
}

/** 固定通知配置：按类型保存，供应商切换与历史配置停用在服务端原子完成。 */
export async function saveFixedMessageChannel(payload: MessageChannelPayload): Promise<{ id: string }> {
  return httpPut<{ id: string }>(`/message-channels/fixed/${payload.kind}`, payload)
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
): Promise<{ providerMessageId?: string; dryRun: boolean; costMs: number; warnings?: string[] }> {
  return httpPost<{ providerMessageId?: string; dryRun: boolean; costMs: number; warnings?: string[] }>(
    `/message-channels/${id}/test-send`,
    payload,
  )
}
