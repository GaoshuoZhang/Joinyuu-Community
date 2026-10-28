import { createCipheriv, generateKeyPairSync, sign, verify } from 'node:crypto'
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WechatPayClient } from './wechat-pay.client'

describe('微信 APIv3 本地协议验证（不请求真实接口）', () => {
  const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const platform = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const originalEnv = { ...process.env }
  let directory: string
  let client: WechatPayClient
  function signedHeaders(body: string, timestamp = Math.floor(Date.now() / 1000).toString()) {
    const nonce = 'test-nonce'
    return new Headers({ 'Wechatpay-Timestamp': timestamp, 'Wechatpay-Nonce': nonce, 'Wechatpay-Serial': 'PUB_KEY_ID_123', 'Wechatpay-Signature': sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), platform.privateKey).toString('base64') })
  }
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'joinyuu-wxpay-unit-'))
    writeFileSync(join(directory, 'private.pem'), merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }))
    writeFileSync(join(directory, 'public.pem'), platform.publicKey.export({ type: 'spki', format: 'pem' }))
  })
  beforeEach(() => {
    Object.assign(process.env, { WXPAY_ENABLED: '1', WXPAY_MCHID: '1234567890', WXPAY_APPID: 'wxtest123', WXPAY_CERT_SERIAL: 'ABC123', WXPAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_123', WXPAY_PRIVATE_KEY_FILE: join(directory, 'private.pem'), WXPAY_PUBLIC_KEY_FILE: join(directory, 'public.pem'), WXPAY_API_V3_KEY: '12345678901234567890123456789012', WXPAY_NOTIFY_BASE_URL: 'https://example.invalid' })
    client = new WechatPayClient()
  })
  afterEach(() => { jest.restoreAllMocks(); for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]; Object.assign(process.env, originalEnv) })
  afterAll(() => { rmSync(join(directory, 'private.pem')); rmSync(join(directory, 'public.pem')); rmdirSync(directory) })

  it('配置检查不请求微信、不回传凭据，缺失或不可读文件阻止发起', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch')
    expect((await client.inspectConfig()).enabled).toBe(true)
    const text = JSON.stringify(await client.inspectConfig())
    expect(text).not.toContain(process.env.WXPAY_API_V3_KEY!)
    expect(text).not.toContain(directory)
    expect(text).not.toContain('1234567890')
    process.env.WXPAY_PRIVATE_KEY_FILE = join(directory, 'missing.pem')
    const result = await client.inspectConfig()
    expect(result.fields.find(f => f.key === 'WXPAY_PRIVATE_KEY_FILE')?.state).toBe('missing')
    expect(result.enabled).toBe(false)
    await expect(client.assertCanCreate()).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('签名包含原始方法、完整查询路径与包体，验证签名后才解析应答', async () => {
    const payload = JSON.stringify({ trade_state: 'NOTPAY' })
    const mock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const headers = init!.headers as Record<string, string>
      const auth = headers.Authorization
      const nonce = /nonce_str="([^"]+)"/.exec(auth)![1]
      const ts = /timestamp="([^"]+)"/.exec(auth)![1]
      const signature = /signature="([^"]+)"/.exec(auth)![1]
      expect(verify('RSA-SHA256', Buffer.from(`GET\n/v3/pay/transactions/out-trade-no/CP123456?mchid=1234567890\n${ts}\n${nonce}\n\n`), merchant.publicKey, Buffer.from(signature, 'base64'))).toBe(true)
      expect(String(url)).toMatch(/^https:\/\/api2?\.mch\.weixin\.qq\.com\//)
      expect(init!.signal).toBeDefined()
      return new Response(payload, { status: 200, headers: signedHeaders(payload) })
    })
    expect((await client.query('CP123456')).trade_state).toBe('NOTPAY')
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it('拒绝篡改报文、过期时间戳、公钥ID错误和签名探测流量', async () => {
    const payload = '{"ok":true}'
    await expect(client.verifyMessage(signedHeaders(payload), payload)).resolves.toBeUndefined()
    await expect(client.verifyMessage(signedHeaders(payload), '{"ok":false}')).rejects.toThrow()
    await expect(client.verifyMessage(signedHeaders(payload, '1'), payload)).rejects.toThrow()
    const wrong = signedHeaders(payload); wrong.set('Wechatpay-Serial', 'PUB_KEY_ID_999')
    await expect(client.verifyMessage(wrong, payload)).rejects.toThrow()
    const probe = signedHeaders(payload); probe.set('Wechatpay-Signature', 'WECHATPAY/SIGNTEST/invalid')
    await expect(client.verifyMessage(probe, payload)).rejects.toThrow()
  })
  it('验签并解密AES-GCM通知，篡改认证标签即拒绝', async () => {
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.WXPAY_API_V3_KEY!), Buffer.from('123456789012'))
    cipher.setAAD(Buffer.from('transaction'))
    const ciphertext = Buffer.concat([cipher.update('{"out_trade_no":"CP123"}'), cipher.final(), cipher.getAuthTag()]).toString('base64')
    const payload = JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', nonce: '123456789012', associated_data: 'transaction', ciphertext } })
    expect((await client.decryptNotification(payload, signedHeaders(payload))).payload.out_trade_no).toBe('CP123')
    const changed = JSON.parse(payload); changed.resource.associated_data = 'tampered'
    const tampered = JSON.stringify(changed)
    await expect(client.decryptNotification(tampered, signedHeaders(tampered))).rejects.toThrow()
  })
  it('拒绝未验签成功响应；关闭启用开关仍可查询存量交易', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"trade_state":"SUCCESS"}', { status: 200 }))
    process.env.WXPAY_ENABLED = '0'
    await expect(client.assertCanCreate()).rejects.toThrow()
    await expect(client.query('CP123')).rejects.toThrow()
  })
  it('网络异常不重新创建订单，下次请求切换备域名', async () => {
    const body = '{}'
    const mock = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(new Response(body, { headers: signedHeaders(body) }))
    await expect(client.query('CP123')).rejects.toThrow('请勿重复付款')
    await client.query('CP123')
    expect(String(mock.mock.calls[1][0])).toContain('api2.mch.weixin.qq.com')
  })
  it('JSAPI调起参数使用对应AppID与RSA签名', async () => {
    const p = await client.jsapiParameters('prepay-test')
    expect(verify('RSA-SHA256', Buffer.from(`${p.appId}\n${p.timeStamp}\n${p.nonceStr}\n${p.package}\n`), merchant.publicKey, Buffer.from(p.paySign, 'base64'))).toBe(true)
  })
})
