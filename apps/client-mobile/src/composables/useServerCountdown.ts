import { computed, onBeforeUnmount, ref } from 'vue'

/** 以服务端时间校正的倒计时：避免客户端时钟偏差导致提前释放/误判失败。
 * 归零只用于提示，不释放资源、不改变订单状态（以后端查询为准）。 */
export function useServerCountdown(
  getExpiresAt: () => string | null | undefined,
  getServerTime: () => string | null | undefined,
) {
  const remainingSeconds = ref(0)
  let offsetMs = 0
  let timer: number | undefined

  function parse(value: string | null | undefined): number | null {
    if (!value) return null
    const ts = Date.parse(value)
    return Number.isFinite(ts) ? ts : null
  }

  function tick() {
    const expires = parse(getExpiresAt())
    remainingSeconds.value = expires == null ? 0 : Math.max(0, Math.ceil((expires - (Date.now() + offsetMs)) / 1000))
  }

  function start() {
    stop()
    const server = parse(getServerTime())
    offsetMs = server == null ? 0 : server - Date.now()
    tick()
    timer = window.setInterval(tick, 1000)
  }

  function stop() {
    if (timer != null) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  const text = computed(() => {
    const total = Math.max(0, remainingSeconds.value)
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  })

  onBeforeUnmount(stop)

  return { remainingSeconds, text, expired: computed(() => remainingSeconds.value <= 0), start, stop }
}
