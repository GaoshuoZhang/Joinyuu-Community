import { describe, expect, it } from 'vitest'
import { detectPaymentEnvironment, paymentMethodLabel, preferredPaymentMethod } from './paymentEnvironment'

describe('payment environment', () => {
  it('detects WeChat, mobile browsers and desktop', () => {
    expect(detectPaymentEnvironment('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) MicroMessenger/8.0')).toBe('wechat')
    expect(detectPaymentEnvironment('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36')).toBe('mobile')
    expect(detectPaymentEnvironment('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36')).toBe('desktop')
  })

  it('prefers the server-supported method per environment', () => {
    expect(preferredPaymentMethod('wechat')).toBe('jsapi')
    expect(preferredPaymentMethod('mobile')).toBe('h5')
    expect(preferredPaymentMethod('desktop')).toBe('native')
    expect(paymentMethodLabel('native')).toBe('微信扫码支付')
  })
})
