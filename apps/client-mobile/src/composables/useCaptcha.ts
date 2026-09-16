import { onMounted, ref } from 'vue'
import { getCaptcha } from '@/api/auth'

export function useCaptcha() {
  const captchaId = ref('')
  const captchaImage = ref('')
  const captchaLoading = ref(false)

  async function refreshCaptcha(): Promise<void> {
    captchaLoading.value = true
    try {
      const result = await getCaptcha()
      captchaId.value = result.captchaId
      captchaImage.value = result.image
    } finally {
      captchaLoading.value = false
    }
  }

  onMounted(() => void refreshCaptcha())
  return { captchaId, captchaImage, captchaLoading, refreshCaptcha }
}
