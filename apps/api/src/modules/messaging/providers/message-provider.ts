import type { ChannelKind, SendMessageInput, SendMessageResult } from '../messaging.types'

/** 消息驱动接口：只负责把已渲染的消息投递出去。
 * 渲染、幂等、重试退避、死信与投递日志由 OutboxService 统一负责，驱动保持无状态。 */
export interface MessageProvider {
  readonly provider: string
  readonly supports: readonly ChannelKind[]
  send(input: SendMessageInput): Promise<SendMessageResult>
}

/** 投递失败：retriable=false 表示配置/参数类错误，直接进死信不再重试 */
export class MessageSendError extends Error {
  readonly retriable: boolean

  constructor(message: string, retriable = true) {
    super(message)
    this.name = 'MessageSendError'
    this.retriable = retriable
  }
}

/** 从非机密配置里取字符串项（缺省空串） */
export function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key]
  if (value == null) return ''
  return String(value).trim()
}

/** 从非机密配置里取布尔项（兼容 'true'/'1' 字符串） */
export function configBool(config: Record<string, unknown>, key: string): boolean {
  const value = config[key]
  if (typeof value === 'boolean') return value
  if (value == null) return false
  return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase())
}

/** 模板映射：{ 我方模板 code: 供应商模板标识 } */
export function templateMapping(config: Record<string, unknown>): Record<string, string> {
  const raw = config.templateMapping
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value != null && String(value).trim()) out[key] = String(value).trim()
    }
    return out
  }
  /* 兼容以 JSON 字符串提交映射的场景 */
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return templateMapping({ templateMapping: JSON.parse(raw) as unknown })
    } catch {
      return {}
    }
  }
  return {}
}

/** 按映射取供应商模板标识；未配置时抛不可重试错误 */
export function resolveProviderTemplate(
  config: Record<string, unknown>,
  templateCode: string,
): string {
  const mapped = templateMapping(config)[templateCode]
  if (!mapped) {
    throw new MessageSendError(`渠道未配置模板映射：${templateCode}`, false)
  }
  return mapped
}
