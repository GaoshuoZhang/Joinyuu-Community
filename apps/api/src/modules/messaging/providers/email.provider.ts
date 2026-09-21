import { createTransport } from 'nodemailer'
import { MessageSendError, configBool, configString, type MessageProvider } from './message-provider'
import type { ChannelKind, SendMessageInput, SendMessageResult } from '../messaging.types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 解析发件人：兼容「显示名 <邮箱>」与纯邮箱两种写法 */
export function parseFromLine(value: string): { fromName: string; fromAddress: string } {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)<\s*([^<>@\s]+@[^<>\s]+)\s*>$/)
  if (match) {
    const name = match[1]
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim()
    return { fromName: name, fromAddress: match[2].trim() }
  }
  return { fromName: '', fromAddress: trimmed }
}

/**
 * SMTP 邮件（nodemailer）；凭据 user/password。
 * 发件人配置方式：fromAddress（邮箱）+ fromName（显示名）优先；
 * 兼容旧版 from 单字段（如 聚屿社区 <no-reply@example.com>）；
 * 仍未提供时降级使用认证用户名（若其为邮箱）。
 * 发送前做「发件人 = 认证用户」一致性预检，不一致以 warnings 回显（QQ/163/企业邮会 553）。
 */
export class SmtpEmailProvider implements MessageProvider {
  readonly provider = 'smtp'
  readonly supports: readonly ChannelKind[] = ['email']

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const host = configString(input.config, 'host')
    const portRaw = configString(input.config, 'port')
    if (!host || !portRaw) {
      throw new MessageSendError('SMTP 未配置 host/port', false)
    }
    const port = Number(portRaw)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new MessageSendError('SMTP 端口无效', false)
    }

    const user = input.credentials.user
    const password = input.credentials.password

    /* ---------- 发件人解析 ---------- */
    const explicitFrom = configString(input.config, 'fromAddress') || configString(input.config, 'from')
    let fromName = configString(input.config, 'fromName')
    let fromAddress = ''
    if (explicitFrom) {
      const parsed = parseFromLine(explicitFrom)
      fromName = fromName || parsed.fromName
      fromAddress = parsed.fromAddress
    }
    if (!fromAddress && user && EMAIL_RE.test(user)) fromAddress = user
    if (!fromAddress) {
      throw new MessageSendError('SMTP 未配置发件人地址（fromAddress），且认证用户名不是邮箱', false)
    }
    const from = fromName ? `"${fromName.replace(/"/g, '')}" <${fromAddress}>` : fromAddress

    /* ---------- 一致性预检（553 预防，非阻断，仅回显） ---------- */
    const warnings: string[] = []
    if (user && EMAIL_RE.test(user) && user.trim().toLowerCase() !== fromAddress.trim().toLowerCase()) {
      warnings.push(
        `发件人 ${fromAddress} 与 SMTP 认证用户名 ${user} 不一致：QQ/163/新浪/企业邮等要求二者完全一致，否则发信将被拒（553 Mail from must equal authorized user）。`,
      )
    }

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
      return { providerMessageId: info.messageId, warnings }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error)
      let hint = ''
      if (/553|Mail from must equal/.test(raw)) {
        hint = '（常见原因：发件人邮箱地址与 SMTP 认证用户名不一致。请把 发件人邮箱地址 改为与 认证用户名 相同的邮箱）'
      } else if (/535|Username and Password|AUTH|auth failed/i.test(raw)) {
        hint = '（常见原因：QQ/163/新浪等邮箱需使用「授权码」作为密码，且需在邮箱设置中开启 SMTP 服务）'
      } else if (/ETIMEDOUT|ECONN|ENOTFOUND|EHOSTUNREACH/.test(raw)) {
        hint = '（网络/端口不通：请确认服务器可访问该 SMTP 主机，端口 465/587 未被防火墙拦截）'
      }
      throw new MessageSendError(`SMTP 发送失败：${raw}${hint}`, true)
    } finally {
      transport.close()
    }
  }
}