import { createPublicKey, verify } from 'node:crypto'

export const PRODUCT_ID = 'joinyuu-community'
export const LICENSE_MAX_BYTES = 32 * 1024
export interface LicensePayload {
  version: 1
  productId: string
  licenseId: string
  customerId: string
  customerName: string
  deploymentId: string
  issuedAt: string
  notBefore: string
  expiresAt: string | null
  updatesUntil: string | null
  keyId: string
}
export interface LicenseEnvelope { payload: string; signature: string }
export type LicenseState = 'valid' | 'expired' | 'invalid'
export interface LicenseEvaluation {
  status: LicenseState
  reason: string
  license: LicensePayload | null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function date(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}
function decode(value: unknown): Buffer {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('许可证文件格式不正确')
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.toString('base64url') !== value) throw new Error('许可证文件编码不正确')
  return bytes
}

/** Verify the exact encoded bytes; never reserialize client-provided JSON before verification. */
export function evaluateLicense(document: unknown, deploymentId: string, keys: Record<string, string>, now = Date.now()): LicenseEvaluation {
  try {
    if (!record(document) || Object.keys(document).sort().join(',') !== 'payload,signature'
      || JSON.stringify(document).length > LICENSE_MAX_BYTES) throw new Error('许可证文件格式不正确')
    const bytes = decode(document.payload)
    const signature = decode(document.signature)
    const p: unknown = JSON.parse(bytes.toString('utf8'))
    if (!record(p)) throw new Error('许可证内容不正确')
    const fields = ['version', 'productId', 'licenseId', 'customerId', 'customerName', 'deploymentId', 'issuedAt', 'notBefore', 'expiresAt', 'updatesUntil', 'keyId']
    if (Object.keys(p).sort().join(',') !== fields.sort().join(',') || p.version !== 1) throw new Error('不支持的许可证格式')
    for (const key of ['productId', 'licenseId', 'customerId', 'customerName', 'deploymentId', 'keyId']) {
      if (typeof p[key] !== 'string' || !p[key].trim() || p[key].length > 200) throw new Error('许可证字段不正确')
    }
    if (!date(p.issuedAt) || !date(p.notBefore) || (p.expiresAt !== null && !date(p.expiresAt))
      || (p.updatesUntil !== null && !date(p.updatesUntil))) throw new Error('许可证时间格式不正确')
    const pem = Object.hasOwn(keys, p.keyId as string) ? keys[p.keyId as string] : undefined
    if (!pem) throw new Error('许可证签发密钥不受信任，请联系供应商')
    const key = createPublicKey(pem)
    if (key.asymmetricKeyType !== 'ed25519' || signature.length !== 64 || !verify(null, bytes, key, signature)) throw new Error('许可证签名无效')
    if (p.productId !== PRODUCT_ID) throw new Error('许可证不适用于当前产品')
    if (p.deploymentId !== deploymentId) throw new Error('许可证不属于当前部署实例')
    if (p.expiresAt !== null && Date.parse(p.expiresAt) <= Date.parse(p.notBefore)) throw new Error('许可证有效期不正确')
    const license = p as unknown as LicensePayload
    if (now < Date.parse(p.notBefore) || now < Date.parse(p.issuedAt)) return { status: 'invalid', reason: '许可证尚未生效或服务器时间异常', license }
    if (p.expiresAt !== null && now >= Date.parse(p.expiresAt)) return { status: 'expired', reason: '许可证已到期，请续期后导入新的许可证', license }
    return { status: 'valid', reason: '授权正常', license }
  } catch (error) {
    return { status: 'invalid', reason: error instanceof Error ? error.message : '许可证无效', license: null }
  }
}
