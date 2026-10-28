import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'

export interface WechatSettings {
  enabled: boolean; mchid: string; appid: string; serial: string; publicKeyId: string; base: string
  privateKey: string; publicKey: string; key: string; certificate: string
  /** 公众号（服务号）AppSecret：仅用于 JSAPI 网页授权换取 OpenID，不参与支付签名 */
  appSecret: string
  /** 客户端站点 HTTPS 源站：网页授权与 H5 支付完成后回跳；须与后端通知域名分别配置 */
  clientBase: string
}
export const emptyWechatSettings = (): WechatSettings => ({ enabled: false, mchid: '', appid: '', serial: '', publicKeyId: '', base: '', privateKey: '', publicKey: '', key: '', certificate: '', appSecret: '', clientBase: '' })
/** 兼容旧版加密配置：缺失的新字段补空串，避免读取 undefined。 */
export function normalizeWechatSettings(value: Partial<WechatSettings> | null | undefined): WechatSettings {
  const base = emptyWechatSettings()
  if (!value) return base
  return {
    ...base,
    enabled: value.enabled === true,
    mchid: value.mchid ?? '', appid: value.appid ?? '', serial: value.serial ?? '', publicKeyId: value.publicKeyId ?? '',
    base: value.base ?? '', privateKey: value.privateKey ?? '', publicKey: value.publicKey ?? '', key: value.key ?? '',
    certificate: value.certificate ?? '', appSecret: value.appSecret ?? '', clientBase: (value.clientBase ?? '').replace(/\/$/, ''),
  }
}
function read(path?: string) { try { return path ? readFileSync(path, 'utf8') : '' } catch { return '' } }
export function environmentWechatSettings(): WechatSettings {
  return normalizeWechatSettings({ enabled: process.env.WXPAY_ENABLED === '1', mchid: process.env.WXPAY_MCHID ?? '', appid: process.env.WXPAY_APPID ?? '', serial: process.env.WXPAY_CERT_SERIAL ?? '', publicKeyId: process.env.WXPAY_PUBLIC_KEY_ID ?? '', base: (process.env.WXPAY_NOTIFY_BASE_URL ?? '').replace(/\/$/, ''), privateKey: read(process.env.WXPAY_PRIVATE_KEY_FILE), publicKey: read(process.env.WXPAY_PUBLIC_KEY_FILE), key: process.env.WXPAY_API_V3_KEY ?? '', certificate: '', appSecret: process.env.WXPAY_APP_SECRET ?? '', clientBase: process.env.WXPAY_CLIENT_BASE_URL ?? '' })
}
function isHttpsOrigin(value: string) {
  if (!value) return false
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && url.origin === value && url.pathname === '/'
}
export function inspectWechatSettings(value: WechatSettings) {
  const rsa = (pem: string, privateKey: boolean) => {
    if (privateKey ? !pem.includes('PRIVATE KEY') : !pem.includes('PUBLIC KEY') || pem.includes('PRIVATE KEY')) return false
    const key = privateKey ? createPrivateKey(pem) : createPublicKey(pem)
    return key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails?.modulusLength === 2048
  }
  const rules: Array<[string, string, () => boolean]> = [
    ['WXPAY_MCHID', value.mchid, () => /^\d+$/.test(value.mchid)],
    ['WXPAY_APPID', value.appid, () => /^wx[a-zA-Z0-9]+$/.test(value.appid)],
    ['WXPAY_CERT_SERIAL', value.serial, () => /^[a-fA-F0-9]+$/.test(value.serial)],
    ['WXPAY_PRIVATE_KEY_FILE', value.privateKey, () => rsa(value.privateKey, true)],
    ['WXPAY_PUBLIC_KEY_ID', value.publicKeyId, () => /^PUB_KEY_ID_\d+$/.test(value.publicKeyId)],
    ['WXPAY_PUBLIC_KEY_FILE', value.publicKey, () => rsa(value.publicKey, false)],
    ['WXPAY_API_V3_KEY', value.key, () => /^[A-Za-z0-9]{32}$/.test(value.key)],
    ['WXPAY_NOTIFY_BASE_URL', value.base, () => { const url = new URL(value.base); return url.protocol === 'https:' && !url.username && !url.password && url.origin === value.base }],
  ]
  const fields = rules.map(([key, content, valid]) => {
    let state: 'configured' | 'missing' | 'invalid' = content ? 'configured' : 'missing'
    if (content) { try { if (!valid()) state = 'invalid' } catch { state = 'invalid' } }
    return { key, state }
  })
  let certificateError = ''
  if (value.certificate) {
    try {
      const cert = new X509Certificate(value.certificate)
      if (cert.serialNumber.toUpperCase() !== value.serial.toUpperCase()) certificateError = '商户证书序列号与上传证书不一致'
      else if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now()) certificateError = '商户 API 证书尚未生效或已过期'
      else if (value.privateKey && !cert.checkPrivateKey(createPrivateKey(value.privateKey))) certificateError = '商户证书与私钥不配套'
    } catch { certificateError = '商户 API 证书文件无效' }
  }
  const ready = fields.every(f => f.state === 'configured') && !certificateError
  /* JSAPI 网页授权：公众号 AppSecret + 后端与客户端 HTTPS 源站齐备才可用；不影响 Native/H5 收款基础能力。 */
  let webOAuthReason = ''
  if (!value.appSecret) webOAuthReason = '未配置公众号 AppSecret，无法完成微信网页授权'
  else if (!/^[A-Za-z0-9]{16,64}$/.test(value.appSecret)) webOAuthReason = '公众号 AppSecret 格式无效'
  else if (!value.clientBase) webOAuthReason = '未配置客户端站点地址，无法回跳收银台'
  else { try { if (!isHttpsOrigin(value.clientBase)) webOAuthReason = '客户端站点地址须为 HTTPS 源站（不带路径）' } catch { webOAuthReason = '客户端站点地址格式无效' } }
  const webOAuthReady = ready && !webOAuthReason
  return {
    ready, enabled: ready && value.enabled, requested: value.enabled, fields, certificateError, checkedAt: new Date().toISOString(),
    notifyUrl: fields.find(f => f.key === 'WXPAY_NOTIFY_BASE_URL')?.state === 'configured' ? `${value.base}/api/payment-notifications/wechat/payment` : null,
    webOAuth: { ready: webOAuthReady, reason: webOAuthReason, callbackUrl: webOAuthReady ? `${value.base}/api/app/commerce/wechat/oauth/callback` : null, clientBase: value.clientBase || null },
  }
}
