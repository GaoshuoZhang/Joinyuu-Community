import { createTransport } from 'nodemailer'
import { MessageSendError, configBool, configString, type MessageProvider } from './message-provider'
import type { ChannelKind, SendMessageInput, SendMessageResult } from '../messaging.types'

/** SMTP 邮件（nodemailer）；凭据 user/password 来自环境变量，非机密参数存渠道 config */
export class SmtpEmailProvider implements MessageProvider {
  readonly provider = 'smtp'
  readonly supports: readonly ChannelKind[] = ['email']

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const host = configString(input.config, 'host')
    const portRaw = configString(input.config, 'port')
    const from = configString(input.config, 'from')
    if (!host || !portRaw || !from) {
      throw new MessageSendError('SMTP 未配置 host/port/from', false)
    }
    const port = Number(portRaw)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new MessageSendError('SMTP 端口无效', false)
    }

    const user = input.credentials.user
    const password = input.credentials.password
    const transport = createTransport({
      host,
      port,
      secure: configBool(input.config, 'secure'),
      auth: user || password ? { user: user ?? '', pass: password ?? '' } : undefined,
    })

    try {
      const info = await transport.sendMail({
        from,
        to: input.recipient,
        subject: input.subject?.trim() || input.templateCode,
        text: input.body,
      })
      return { providerMessageId: info.messageId }
    } catch (error) {
      throw new MessageSendError(
        `SMTP 发送失败：${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    } finally {
      transport.close()
    }
  }
}
