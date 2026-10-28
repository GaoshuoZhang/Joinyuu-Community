import { ref } from 'vue'
import { ApiError } from '@/api/http'
import { fetchWechatAuthorizeUrl, startOrderPayment } from '@/api/commerce'
import type { CommerceJsapiParams, CommerceOrder, CommercePayMethod } from '@/types'

export type PaymentLaunchResult =
  | { status: 'ok' | 'cancel' | 'fail' }
  | { status: 'redirect' }
  | { status: 'qr'; codeUrl: string }
  | { status: 'authorizing' }
  | { status: 'error'; message: string }

interface WeixinBridge {
  invoke(api: string, params: Record<string, unknown>, callback: (res: { err_msg?: string }) => void): void
}

declare global {
  interface Window {
    WeixinJSBridge?: WeixinBridge
  }
}

function waitForBridge(timeoutMs = 10_000): Promise<WeixinBridge> {
  if (typeof window === 'undefined') return Promise.reject(new Error('当前环境不支持微信支付'))
  if (window.WeixinJSBridge) return Promise.resolve(window.WeixinJSBridge)
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('WeixinJSBridgeReady', ready)
      reject(new Error('微信支付组件未加载，请稍后重试或更新微信版本'))
    }, timeoutMs)
    function ready() {
      window.clearTimeout(timer)
      window.removeEventListener('WeixinJSBridgeReady', ready)
      if (window.WeixinJSBridge) resolve(window.WeixinJSBridge)
      else reject(new Error('微信支付组件未加载，请稍后重试'))
    }
    window.addEventListener('WeixinJSBridgeReady', ready, { once: true })
  })
}

/** 调起微信 JSAPI：客户端回调不作为收款凭证，结果页必须再向后端查询。 */
async function invokeJsapi(params: CommerceJsapiParams): Promise<'ok' | 'cancel' | 'fail'> {
  const bridge = await waitForBridge()
  return new Promise((resolve) => {
    bridge.invoke('chooseWXPay', { ...params }, (res) => {
      const message = res.err_msg ?? ''
      if (message.includes(':ok')) resolve('ok')
      else if (message.includes(':cancel')) resolve('cancel')
      else resolve('fail')
    })
  })
}

/** 发起支付：防重复提交、按环境调起 JSAPI/H5/Native、网页授权跳转。 */
export function usePayment() {
  const busy = ref(false)
  const error = ref('')

  async function pay(order: CommerceOrder, method: CommercePayMethod): Promise<PaymentLaunchResult> {
    if (busy.value) return { status: 'error', message: '正在发起支付，请稍候' }
    busy.value = true
    error.value = ''
    try {
      const launch = await startOrderPayment(order.id, method)
      if (launch.requiresAuthorization) {
        const { url } = await fetchWechatAuthorizeUrl(order.id)
        window.location.assign(url)
        return { status: 'authorizing' }
      }
      if (launch.method === 'jsapi' && launch.jsapi) {
        return { status: await invokeJsapi(launch.jsapi) }
      }
      if (launch.method === 'h5' && launch.h5Url) {
        window.location.assign(launch.h5Url)
        return { status: 'redirect' }
      }
      if (launch.method === 'native' && launch.codeUrl) {
        return { status: 'qr', codeUrl: launch.codeUrl }
      }
      throw new Error('支付调起参数缺失，请稍后重试')
    } catch (e) {
      const message = e instanceof ApiError || e instanceof Error ? e.message : '发起支付失败，请稍后重试'
      error.value = message
      return { status: 'error', message }
    } finally {
      busy.value = false
    }
  }

  return { busy, error, pay }
}
