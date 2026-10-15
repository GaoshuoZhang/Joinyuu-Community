import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { httpGet } from '@/api/http'
import { applyCustomerTheme, orderedHomeModules, type CustomerTheme } from '@/utils/customerTheme'

export const useCustomerThemeStore = defineStore('customer-theme', () => {
  const theme = ref<CustomerTheme | null>(null)
  const preview = ref(false)
  const error = ref('')
  const homeModules = computed(() => orderedHomeModules(theme.value))
  let token: string | null = null
  let pending: Promise<void> | null = null
  let loadedAt = 0
  function initPreview() {
    const url = new URL(window.location.href)
    const supplied = url.searchParams.get('themePreview')
    try {
      if (supplied) sessionStorage.setItem('joinyuu-theme-preview', supplied)
      token = supplied || sessionStorage.getItem('joinyuu-theme-preview')
    } catch { token = supplied }
    if (supplied) {
      url.searchParams.delete('themePreview')
      window.history.replaceState(window.history.state, '', url)
    }
    preview.value = !!token
  }
  async function load(force = false): Promise<void> {
    if (pending) return pending
    if (!force && Date.now() - loadedAt < 60_000) return
    pending = (async () => {
      try {
        const current = await httpGet<CustomerTheme | null>(`/mobile-theme${token ? `?preview=${encodeURIComponent(token)}` : ''}`)
        theme.value = current
        applyCustomerTheme(current)
        error.value = ''
        loadedAt = Date.now()
      } catch (e) {
        error.value = e instanceof Error ? e.message : '主题加载失败'
        // Keep the last usable theme on transient failure; first load remains the public UI.
      } finally { pending = null }
    })()
    return pending
  }
  function exitPreview() {
    token = null
    preview.value = false
    try { sessionStorage.removeItem('joinyuu-theme-preview') } catch { /* Storage may be disabled. */ }
    theme.value = null
    applyCustomerTheme(null)
    void load(true)
  }
  return { theme, preview, error, homeModules, initPreview, load, exitPreview }
})
