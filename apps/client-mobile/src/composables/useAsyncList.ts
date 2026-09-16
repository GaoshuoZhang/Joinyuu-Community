import { ref } from 'vue'

/** 通用异步加载态（列表/详情通用）：loading/error/run。
 * v36：请求序号保护——快速切换筛选或搜索时，旧请求结果不会覆盖新结果。 */
export function useAsyncList<T>(fetcher: () => Promise<T>) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref('')
  let requestId = 0

  async function run(): Promise<void> {
    const id = ++requestId
    loading.value = true
    error.value = ''
    try {
      const result = await fetcher()
      if (id !== requestId) return
      data.value = result
    } catch (e) {
      if (id !== requestId) return
      error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  return { data, loading, error, run }
}
