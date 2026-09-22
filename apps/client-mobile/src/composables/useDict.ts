import { ref } from 'vue'
import { fetchDict } from '@/api/config'
import type { DictItem } from '@/types'

/** 字典缓存（同一 type 只拉一次）；v38：暴露加载失败状态与重试。
 * v48：加 TTL 与强制刷新——模块级缓存原先永不过期，后台新增字典项后本会话内一直不可见，
 * 需整页刷新才生效；现在过期自动回源，页面再次激活时也可强制刷新。 */
const TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { items: DictItem[]; at: number }>()

export function useDict(type: string) {
  const cached = cache.get(type)
  const items = ref<DictItem[]>(cached?.items ?? [])
  const loading = ref(false)
  const error = ref('')

  async function request() {
    loading.value = true
    error.value = ''
    try {
      const list = await fetchDict(type)
      cache.set(type, { items: list, at: Date.now() })
      items.value = list
    } catch (e) {
      error.value = e instanceof Error ? e.message : '字典加载失败'
    } finally {
      loading.value = false
    }
  }

  async function load() {
    const hit = cache.get(type)
    if (hit && Date.now() - hit.at < TTL_MS) {
      items.value = hit.items
      return
    }
    await request()
  }

  void load()
  return { items, loading, error, reload: load, refresh: request }
}
