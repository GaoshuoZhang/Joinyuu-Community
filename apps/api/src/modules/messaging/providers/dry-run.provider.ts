import type { MessageProvider } from './message-provider'
import type { ChannelKind, SendMessageInput, SendMessageResult } from '../messaging.types'

/** 干跑驱动：不入真实通道，仅记录日志并返回可追踪的伪回执。
 * 用途：开发/测试环境为未配置真实凭据的渠道提供端到端可验证的投递路径，不产生外部副作用。 */
export class DryRunMessageProvider implements MessageProvider {
  readonly provider = 'dry_run'
  readonly supports: readonly ChannelKind[] = ['sms', 'email', 'inapp']

  send(input: SendMessageInput): Promise<SendMessageResult> {
    const serial = `dry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    console.log(
      `[messaging:dry_run] ${input.templateCode} → ${input.recipient}（${input.body.length} 字）`,
    )
    return Promise.resolve({ providerMessageId: serial })
  }
}
