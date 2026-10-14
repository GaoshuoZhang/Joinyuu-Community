import { ref, watch, type Ref } from 'vue'
import { useRoute, useRouter, type Router } from 'vue-router'

/** 只有同一后台的历史记录才返回，直接打开详情时回到对应列表。 */
export function backOrFallback(router: Router, fallback: string) {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//') &&
      previous.split('?')[0] !== '/login' && router.resolve(previous).matched.length > 0) router.back()
  else void router.push(fallback)
}

/** 将详情页选项卡同步到 ?tab=，使刷新、返回和复制链接都能保留上下文。 */
export function useQueryTab<T extends string>(fallback: T, allowed: readonly T[]): Ref<T> {
  const route = useRoute()
  const router = useRouter()
  const selected = ref<T>(fallback) as Ref<T>

  watch(
    () => route.query.tab,
    (value) => {
      const next = String(value ?? '') as T
      selected.value = allowed.includes(next) ? next : fallback
    },
    { immediate: true },
  )

  watch(selected, (value) => {
    if (route.query.tab === value) return
    router.replace({ query: { ...route.query, tab: value } })
  })

  return selected
}
