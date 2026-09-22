import { onActivated, watch } from 'vue'
import { useRoute } from 'vue-router'

/** v41：KeepAlive 列表页被复用（同路由不同 query，如全局搜索「查看更多需求」）或重新激活时，
 * 把 URL 中的筛选参数同步回本地状态。apply 需自行判断无变化时直接 return，避免重复请求。 */
export function useRouteQuerySync(path: string, apply: (query: Record<string, string>) => void) {
  const route = useRoute()
  watch(
    () => route.fullPath,
    () => {
      if (route.path !== path) return
      apply(route.query as Record<string, string>)
    },
  )
  onActivated(() => {
    if (route.path !== path) return
    apply(route.query as Record<string, string>)
  })
}
