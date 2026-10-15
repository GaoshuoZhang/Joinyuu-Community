import type { MessageTemplate, MessageTemplateDetail, MessageTemplatePayload } from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* 消息中心 · 模板中心：变量白名单 + 保存即发布 + 历史回滚 + 测试发送。 */

export async function fetchMessageTemplates(): Promise<MessageTemplate[]> {
  return httpGet<MessageTemplate[]>('/message-templates')
}

export async function fetchMessageTemplateDetail(id: string): Promise<MessageTemplateDetail> {
  return httpGet<MessageTemplateDetail>(`/message-templates/${id}`)
}

/* POST /api/admin/message-templates — 新建并发布首个版本 */
export async function createMessageTemplate(
  payload: MessageTemplatePayload,
): Promise<{ id: string }> {
  return httpPost<{ id: string }>('/message-templates', payload)
}

/* PUT /api/admin/message-templates/:id/draft — 保存并发布新版本（沿用既有路径） */
export async function saveMessageTemplateDraft(
  id: string,
  payload: Omit<MessageTemplatePayload, 'code' | 'kind'>,
): Promise<{ version: number }> {
  return httpPut<{ version: number }>(`/message-templates/${id}/draft`, payload)
}

export async function submitMessageTemplate(id: string): Promise<{ version: number }> {
  return httpPost<{ version: number }>(`/message-templates/${id}/submit`)
}

export async function reviewMessageTemplate(
  id: string,
  payload: { approve: boolean; note?: string },
): Promise<{ version: number }> {
  return httpPost<{ version: number }>(`/message-templates/${id}/review`, payload)
}

/* POST /:id/publish — 发布；传 version 即为回滚到历史版本 */
export async function publishMessageTemplate(
  id: string,
  version?: number,
): Promise<{ version: number }> {
  return httpPost<{ version: number }>(`/message-templates/${id}/publish`, version ? { version } : {})
}

export async function disableMessageTemplate(id: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/message-templates/${id}/disable`)
}

export async function testSendMessageTemplate(
  id: string,
  payload: { recipient: string; version?: number; variables?: Record<string, string> },
): Promise<{ providerMessageId?: string; dryRun: boolean; costMs: number; warnings?: string[] }> {
  return httpPost<{ providerMessageId?: string; dryRun: boolean; costMs: number; warnings?: string[] }>(
    `/message-templates/${id}/test-send`,
    payload,
  )
}

export async function previewMessageTemplate(
  id: string,
  payload: { version?: number; variables?: Record<string, string>; draft?: { subject?: string; body: string; variables: string[] } },
): Promise<{ subject?: string; body: string }> {
  return httpPost<{ subject?: string; body: string }>(`/message-templates/${id}/preview`, payload)
}
