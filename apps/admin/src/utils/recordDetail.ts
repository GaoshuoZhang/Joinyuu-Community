import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/** 列表详情与 record 查询参数同步，过期请求不能覆盖当前记录。 */
export function useRecordDetail<T>(load: (id: string) => Promise<T>) {
  const route = useRoute()
  const router = useRouter()
  const visible = ref(false)
  const loading = ref(false)
  const error = ref('')
  const current = shallowRef<T | null>(null)
  let version = 0
  async function reload() {
    const request = ++version
    const id = typeof route.query.record === 'string' ? route.query.record : ''
    visible.value = !!id
    error.value = ''
    current.value = null
    loading.value = !!id
    if (!id) return
    try {
      const result = await load(id)
      if (request === version) current.value = result
    } catch (cause) {
      if (request === version) error.value = cause instanceof Error ? cause.message : '详情加载失败'
    } finally {
      if (request === version) loading.value = false
    }
  }
  function open(id: string) {
    if (route.query.record === id) void reload()
    else void router.push({ query: { ...route.query, record: id } })
  }
  function close() {
    ++version
    visible.value = false
    loading.value = false
    const query = { ...route.query }
    delete query.record
    void router.replace({ query })
  }
  watch(() => route.query.record, reload, { immediate: true })
  onScopeDispose(() => { ++version })
  return { visible, loading, error, current, open, close, reload }
}
