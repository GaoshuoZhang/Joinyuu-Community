import { generateKeyPairSync, sign } from 'node:crypto'
import { evaluateLicense, PRODUCT_ID, type LicensePayload } from './license-format'

describe('offline license verification', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const keys = { test: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
  const now = Date.parse('2026-10-14T00:00:00.000Z')
  const payload: LicensePayload = {
    version: 1, keyId: 'test', productId: PRODUCT_ID, deploymentId: 'installation-a', licenseId: 'L1',
    customerId: 'C1', customerName: '测试客户', issuedAt: '2026-01-01T00:00:00.000Z',
    notBefore: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z', updatesUntil: null,
  }
  function signed(value: unknown = payload) {
    const bytes = Buffer.from(JSON.stringify(value))
    return { payload: bytes.toString('base64url'), signature: sign(null, bytes, privateKey).toString('base64url') }
  }
  const evaluate = (document: unknown, installation = 'installation-a') => evaluateLicense(document, installation, keys, now)
  it('accepts valid and perpetual licenses, independent of expired maintenance', () => {
    expect(evaluate(signed()).status).toBe('valid')
    expect(evaluate(signed({ ...payload, expiresAt: null, updatesUntil: '2026-02-01T00:00:00.000Z' })).status).toBe('valid')
  })
  it('expires at the exact boundary, without restart or grace period', () => {
    expect(evaluate(signed({ ...payload, expiresAt: new Date(now).toISOString() })).status).toBe('expired')
    expect(evaluateLicense(signed(), 'installation-a', keys, Date.parse(payload.expiresAt!)).status).toBe('expired')
  })
  it('rejects tampering, wrong installation/product/key and malformed signatures', () => {
    expect(evaluate({ ...signed(), payload: Buffer.from(JSON.stringify({ ...payload, expiresAt: null })).toString('base64url') }).status).toBe('invalid')
    expect(evaluate(signed(), 'installation-b').status).toBe('invalid')
    expect(evaluate(signed({ ...payload, productId: 'other' })).status).toBe('invalid')
    expect(evaluateLicense(signed(), 'installation-a', {}, now).status).toBe('invalid')
    expect(evaluate({ ...signed(), signature: 'abc' }).status).toBe('invalid')
  })
  it('rejects future activation, invalid dates, unsupported fields and invalid ranges', () => {
    for (const changes of [
      { notBefore: '2026-12-01T00:00:00.000Z' }, { issuedAt: '2026-12-01T00:00:00.000Z' },
      { expiresAt: '2026-02-30T00:00:00.000Z' }, { expiresAt: payload.notBefore },
      { features: [] }, { serial: 1 }, { limits: {} }, { version: 2 }, { customerName: '' },
    ]) expect(evaluate(signed({ ...payload, ...changes })).status).toBe('invalid')
    expect(evaluate(null).status).toBe('invalid')
    expect(evaluate({ ...signed(), extra: true }).status).toBe('invalid')
  })
})
