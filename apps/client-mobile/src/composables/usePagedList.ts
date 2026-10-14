import { computed, ref, shallowRef } from 'vue'
import type { PageResult } from '@/types'

export function usePagedList<T extends { id: string }>(fetchPage: (page: number, pageSize: number) => Promise<PageResult<T>>, pageSize = 20) {
  const items = shallowRef<T[]>([])
  const total = ref(0)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref('')
  const moreError = ref('')
  const page = ref(0)
  let requestId = 0
  const hasMore = computed(() => items.value.length < total.value)

  async function refresh() {
    const id = ++requestId
    loading.value = true
    loadingMore.value = false
    error.value = ''
    moreError.value = ''
    page.value = 0
    items.value = []
    try {
      const result = await fetchPage(1, pageSize)
      if (id !== requestId) return
      items.value = result.list
      total.value = result.total
      page.value = 1
    } catch (cause) {
      if (id === requestId) error.value = cause instanceof Error ? cause.message : '加载失败，请重试'
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value) return
    const id = requestId
    const nextPage = page.value + 1
    loadingMore.value = true
    moreError.value = ''
    try {
      const result = await fetchPage(nextPage, pageSize)
      if (id !== requestId) return
      const known = new Set(items.value.map((item) => item.id))
      items.value.push(...result.list.filter((item) => !known.has(item.id)))
      total.value = result.total
      page.value = nextPage
    } catch (cause) {
      if (id === requestId) moreError.value = cause instanceof Error ? cause.message : '加载失败，请重试'
    } finally {
      if (id === requestId) loadingMore.value = false
    }
  }

  return { items, total, loading, loadingMore, error, moreError, hasMore, refresh, loadMore }
}
