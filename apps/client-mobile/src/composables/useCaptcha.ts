import { ref } from 'vue'
import { getCaptcha } from '@/api/auth'

export function useCaptcha() {
  const captchaId = ref('')
  const captchaImage = ref('')
  const captchaLoading = ref(false)

  /** 刷新验证码：失败不再静默抛出，改为返回 { ok, message } 供调用方感知并提示 */
  async function refreshCaptcha(): Promise<{ ok: boolean; message?: string }> {
    captchaLoading.value = true
    try {
      const result = await getCaptcha()
      captchaId.value = result.captchaId
      captchaImage.value = result.image
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '验证码加载失败' }
    } finally {
      captchaLoading.value = false
    }
  }

  return { captchaId, captchaImage, captchaLoading, refreshCaptcha }
}
