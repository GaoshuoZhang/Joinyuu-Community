import { Injectable, Logger, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { createDecipheriv, randomBytes, sign, verify } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { PaymentConfigService } from './payment-config.service'
import { environmentWechatSettings, inspectWechatSettings } from './wechat-config'

/** APIv3 reference implementation (non-official maintenance).
 * Protocol sources and launch limitations: docs/commerce-implementation.md.
 * No secrets, authorization headers or decrypted payer data may be logged.
 */
export class WechatApiError extends Error {
  constructor(readonly code: string, readonly httpStatus: number) { super(`微信支付请求未完成（${code}）`) }
}
export interface WechatTransaction {
  appid: string; mchid: string; out_trade_no: string; transaction_id: string; trade_state: string
  success_time?: string; amount: { total: number; currency: string }
}
export interface WechatRefundResult {
  out_refund_no: string; out_trade_no: string; status: string
  amount: { total: number; refund: number; currency: string }
}
export interface WechatPrepay { code_url?: string; h5_url?: string; prepay_id?: string }

@Injectable()
export class WechatPayClient {
  private readonly logger = new Logger(WechatPayClient.name)
  private backupUntil = 0

  constructor(@Optional() private readonly settings?: PaymentConfigService) {}

  private runtime(tx?: Prisma.TransactionClient) { return this.settings ? this.settings.runtime(tx) : Promise.resolve(environmentWechatSettings()) }
  async inspectConfig() { return inspectWechatSettings(await this.runtime()) }
  async config() {
    const result = await this.inspectConfig()
    return { ready: result.ready, enabled: result.enabled, missing: result.fields.filter(f => f.state === 'missing').map(f => f.key), invalid: result.fields.filter(f => f.state === 'invalid').map(f => f.key), products: ['native', 'jsapi', 'h5'], role: 'merchant', apiVersion: 'v3', verification: 'public_key' }
  }
  async credentials() {
    const c = await this.runtime()
    if (!inspectWechatSettings(c).ready) throw new ServiceUnavailableException('微信支付配置未完成或格式无效')
    return c
  }
  async assertCanCreate(tx?: Prisma.TransactionClient) {
    const c = await this.runtime(tx)
    if (!inspectWechatSettings(c).enabled) throw new ServiceUnavailableException('微信收款未启用，请完成商户配置及联调验收')
    return c
  }

  async verifyMessage(headers: Headers, body: string) {
    const c = await this.credentials()
    const timestamp = headers.get('wechatpay-timestamp') ?? ''
    const nonce = headers.get('wechatpay-nonce') ?? ''
    const signature = headers.get('wechatpay-signature') ?? ''
    if (headers.get('wechatpay-serial') !== c.publicKeyId || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !nonce || !signature || signature.startsWith('WECHATPAY/SIGNTEST/')) throw new UnauthorizedException('微信支付签名校验失败')
    if (!verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), c.publicKey, Buffer.from(signature, 'base64'))) throw new UnauthorizedException('微信支付签名校验失败')
  }

  async decryptNotification(body: string, headers: Headers) {
    await this.verifyMessage(headers, body)
    const notice = JSON.parse(body) as { event_type: string; resource: { algorithm: string; ciphertext: string; nonce: string; associated_data?: string } }
    const r = notice.resource
    if (r?.algorithm !== 'AEAD_AES_256_GCM') throw new UnauthorizedException('通知加密算法不支持')
    const ciphertext = Buffer.from(r.ciphertext, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from((await this.credentials()).key), Buffer.from(r.nonce))
    decipher.setAuthTag(ciphertext.subarray(-16))
    decipher.setAAD(Buffer.from(r.associated_data ?? ''))
    const payload = JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString('utf8')) as Record<string, unknown>
    return { event: notice.event_type, payload }
  }

  async request<T>(method: 'GET' | 'POST', path: string, data?: object): Promise<T> {
    const c = await this.credentials()
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = randomBytes(16).toString('hex')
    const body = data ? JSON.stringify(data) : ''
    const signature = sign('RSA-SHA256', Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`), c.privateKey).toString('base64')
    const host = Date.now() < this.backupUntil || Math.random() < 0.01 ? 'https://api2.mch.weixin.qq.com' : 'https://api.mch.weixin.qq.com'
    let response: Response
    let text: string
    try {
      response = await fetch(host + path, { method, redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Wechatpay-Serial': c.publicKeyId, Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${c.mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${c.serial}",signature="${signature}"` }, body: body || undefined, signal: AbortSignal.timeout(8000) })
      text = await response.text()
    } catch {
      this.backupUntil = Date.now() + 60000
      this.logger.warn('微信支付网络异常；结果须由原订单查单确认')
      throw new ServiceUnavailableException('支付结果暂未确认，请勿重复付款')
    }
    this.logger.log(`微信支付 HTTP ${response.status} Request-ID=${response.headers.get('request-id') ?? 'unavailable'}`)
    if (response.status >= 500) this.backupUntil = Date.now() + 60000
    // Successful responses (including 204) are never trusted without verification.
    if (response.ok || response.headers.has('wechatpay-signature')) await this.verifyMessage(response.headers, text)
    const result = text ? JSON.parse(text) as T & { code?: string } : {} as T & { code?: string }
    if (!response.ok) throw new WechatApiError(result.code ?? `HTTP_${response.status}`, response.status)
    return result
  }

  async prepay(input: { id: string; amountFen: number; title: string; expiresAt: Date; method: 'native' | 'h5' | 'jsapi'; ip?: string; openid?: string; notifyUrl?: string }): Promise<WechatPrepay> {
    const c = await this.assertCanCreate()
    const extra = input.method === 'jsapi' ? { payer: { openid: input.openid } } : input.method === 'h5' ? { scene_info: { payer_client_ip: input.ip, h5_info: { type: 'Wap' } } } : {}
    if (input.method === 'jsapi' && !input.openid) throw new ServiceUnavailableException('尚未完成微信网页授权')
    return this.request('POST', `/v3/pay/transactions/${input.method}`, { appid: c.appid, mchid: c.mchid, description: input.title.replace(/[\u{10000}-\u{10FFFF}]/gu, '').slice(0, 127), out_trade_no: input.id, time_expire: input.expiresAt.toISOString(), notify_url: input.notifyUrl ?? `${c.base}/api/payment-notifications/wechat/payment`, amount: { total: input.amountFen, currency: 'CNY' }, ...extra })
  }

  async jsapiParameters(prepayId: string) {
    const c = await this.credentials(), timeStamp = Math.floor(Date.now() / 1000).toString(), nonceStr = randomBytes(16).toString('hex')
    const pkg = `prepay_id=${prepayId}`
    return { appId: c.appid, timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign: sign('RSA-SHA256', Buffer.from(`${c.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`), c.privateKey).toString('base64') }
  }

  async query(id: string) { return this.request<WechatTransaction>('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(id)}?mchid=${(await this.credentials()).mchid}`) }
  async close(id: string) { return this.request('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(id)}/close`, { mchid: (await this.credentials()).mchid }) }
  async refund(id: string, paymentId: string, total: number, amount: number, reason: string) { return this.request<WechatRefundResult>('POST', '/v3/refund/domestic/refunds', { out_trade_no: paymentId, out_refund_no: id, reason, amount: { total, refund: amount, currency: 'CNY' } }) }
  async queryRefund(id: string) { return this.request<WechatRefundResult>('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(id)}`) }
}
