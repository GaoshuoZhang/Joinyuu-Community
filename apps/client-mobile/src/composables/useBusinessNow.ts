import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 业务时间源：返回当前时间（毫秒）并在页面可见/定时器触发时刷新，供“即将开始/已结束”等派生展示使用。 */
export function useBusinessNow(intervalMs = 30_000) {
  const nowMs = ref(Date.now())
  let timer: number | undefined
  const update = () => {
    nowMs.value = Date.now()
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
  return nowMs
}
