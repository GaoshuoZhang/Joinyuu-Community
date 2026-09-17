import { onActivated } from 'vue'

/** v38：KeepAlive 页面的激活刷新钩子。
 * 首次挂载由 onMounted 负责加载，本钩子只在「再次进入页面」时刷新，避免重复请求。 */
export function useRefreshOnActivate(refresh: () => void) {
  let first = true
  onActivated(() => {
    if (first) {
      first = false
      return
    }
    refresh()
  })
}
