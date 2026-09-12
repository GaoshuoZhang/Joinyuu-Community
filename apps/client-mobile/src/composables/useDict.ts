import { ref } from 'vue'
import { fetchDict } from '@/api/config'
import type { DictItem } from '@/types'

/** 字典缓存（双端共享；同一 type 只拉一次） */
const cache = new Map<string, DictItem[]>()

export function useDict(type: string) {
  const items = ref<DictItem[]>(cache.get(type) ?? [])
  async function load() {
    if (cache.has(type)) return
    const list = await fetchDict(type)
    cache.set(type, list)
    items.value = list
  }
  void load()
  return { items, reload: load }
}
