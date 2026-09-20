import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export function useIncrementalList<T>(source: MaybeRefOrGetter<readonly T[]>, pageSize = 20) {
  const visibleCount = ref(pageSize)
  const items = computed(() => toValue(source))
  const visibleItems = computed(() => items.value.slice(0, visibleCount.value))
  const hasMore = computed(() => visibleCount.value < items.value.length)

  watch(items, () => {
    visibleCount.value = pageSize
  })

  function showMore() {
    visibleCount.value += pageSize
  }

  return { visibleItems, hasMore, showMore }
}
