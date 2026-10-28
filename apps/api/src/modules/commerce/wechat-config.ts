import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'

export interface WechatSettings {
  enabled: boolean; mchid: string; appid: string; serial: string; publicKeyId: string; base: string
  privateKey: string; publicKey: string; key: string; certificate: string
}
export const emptyWechatSettings = (): WechatSettings => ({ enabled: false, mchid: '', appid: '', serial: '', publicKeyId: '', base: '', privateKey: '', publicKey: '', key: '', certificate: '' })
function read(path?: string) { try { return path ? readFileSync(path, 'utf8') : '' } catch { return '' } }
export function environmentWechatSettings(): WechatSettings {
  return { enabled: process.env.WXPAY_ENABLED === '1', mchid: process.env.WXPAY_MCHID ?? '', appid: process.env.WXPAY_APPID ?? '', serial: process.env.WXPAY_CERT_SERIAL ?? '', publicKeyId: process.env.WXPAY_PUBLIC_KEY_ID ?? '', base: (process.env.WXPAY_NOTIFY_BASE_URL ?? '').replace(/\/$/, ''), privateKey: read(process.env.WXPAY_PRIVATE_KEY_FILE), publicKey: read(process.env.WXPAY_PUBLIC_KEY_FILE), key: process.env.WXPAY_API_V3_KEY ?? '', certificate: '' }
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
  return { ready, enabled: ready && value.enabled, requested: value.enabled, fields, certificateError, checkedAt: new Date().toISOString(), notifyUrl: fields.find(f => f.key === 'WXPAY_NOTIFY_BASE_URL')?.state === 'configured' ? `${value.base}/api/payment-notifications/wechat/payment` : null }
}
