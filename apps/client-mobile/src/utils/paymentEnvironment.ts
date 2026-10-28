import type { CommercePayMethod } from '@/types'

export type PaymentEnvironment = 'wechat' | 'mobile' | 'desktop'

/** 仅作为请求提示与按钮文案依据：是否真正可支付始终由后端 capabilities/支付接口复核。 */
export function detectPaymentEnvironment(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): PaymentEnvironment {
  if (/MicroMessenger/i.test(userAgent)) return 'wechat'
  if (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

export function preferredPaymentMethod(environment: PaymentEnvironment): CommercePayMethod {
  if (environment === 'wechat') return 'jsapi'
  if (environment === 'mobile') return 'h5'
  return 'native'
}

export function paymentMethodLabel(method: CommercePayMethod): string {
  if (method === 'jsapi') return '微信支付'
  if (method === 'h5') return '微信支付'
  return '微信扫码支付'
}
