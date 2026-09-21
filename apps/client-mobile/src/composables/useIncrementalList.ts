import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export function useIncrementalList<T>(source: MaybeRefOrGetter<readonly T[]>, pageSize = 20) {
  const visibleCount = ref(pageSize)
  const items = computed(() => toValue(source))
  const visibleItems = computed(() => items.value.slice(0, visibleCount.value))
  const hasMore = computed(() => visibleCount.value < items.value.length)

  /* 监听数组长度而非数组引用：原地 push 不换引用，只看引用会漏掉新增项而无法重置分页 */
  watch(() => items.value.length, () => {
    visibleCount.value = pageSize
  })

  function showMore() {
    visibleCount.value += pageSize
  }

  return { visibleItems, hasMore, showMore }
}
