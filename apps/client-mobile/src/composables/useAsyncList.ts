import { ref } from 'vue'
import { ApiError } from '@/api/http'

/** 通用异步加载态（列表/详情通用）：loading/error/run。
 * v36：请求序号保护——快速切换筛选或搜索时，旧请求结果不会覆盖新结果。
 * errorCode：失败时的业务/HTTP 状态码（如 404 资源不存在），供页面区分「重试」与「返回」出口。 */
export function useAsyncList<T>(fetcher: () => Promise<T>) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref('')
  const errorCode = ref<number | null>(null)
  let requestId = 0

  async function run(): Promise<void> {
    const id = ++requestId
    loading.value = true
    error.value = ''
    errorCode.value = null
    try {
      const result = await fetcher()
      if (id !== requestId) return
      data.value = result
    } catch (e) {
      if (id !== requestId) return
      error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
      errorCode.value = e instanceof ApiError ? e.code : null
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  return { data, loading, error, errorCode, run }
}
