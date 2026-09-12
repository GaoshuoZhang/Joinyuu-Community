import { ref } from 'vue'

/** 通用异步加载态（列表/详情通用）：loading/error/run */
export function useAsyncList<T>(fetcher: () => Promise<T>) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function run(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      data.value = await fetcher()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, run }
}
