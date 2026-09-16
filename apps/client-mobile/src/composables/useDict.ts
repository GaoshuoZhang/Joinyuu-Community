import { ref } from 'vue'
import { fetchDict } from '@/api/config'
import type { DictItem } from '@/types'

/** 字典缓存（同一 type 只拉一次）；v38：暴露加载失败状态与重试。 */
const cache = new Map<string, DictItem[]>()

export function useDict(type: string) {
  const items = ref<DictItem[]>(cache.get(type) ?? [])
  const loading = ref(false)
  const error = ref('')

  async function load() {
    if (cache.has(type)) {
      items.value = cache.get(type) ?? []
      return
    }
    loading.value = true
    error.value = ''
    try {
      const list = await fetchDict(type)
      cache.set(type, list)
      items.value = list
    } catch (e) {
      error.value = e instanceof Error ? e.message : '字典加载失败'
    } finally {
      loading.value = false
    }
  }

  void load()
  return { items, loading, error, reload: load }
}
