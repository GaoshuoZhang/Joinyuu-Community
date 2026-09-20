import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { mockClockVersion, mockNowMs } from '@/mock/runtime'

export function useBusinessNow(intervalMs = 30_000) {
  const nowMs = ref(mockNowMs())
  let timer: number | undefined
  const update = () => {
    nowMs.value = mockNowMs()
  }

  onMounted(() => {
    update()
    timer = window.setInterval(update, intervalMs)
    document.addEventListener('visibilitychange', update)
  })
  onBeforeUnmount(() => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', update)
  })
  watch(mockClockVersion, update)
  return nowMs
}
