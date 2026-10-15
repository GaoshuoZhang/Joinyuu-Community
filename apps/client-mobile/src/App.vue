<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SkipLink from '@/components/shared/SkipLink.vue'
import { documentTitleFor } from '@/constants/pageTitles'
import { useConfigStore } from '@/stores/config'
import { useCustomerThemeStore } from '@/stores/customerTheme'

const route = useRoute()
const router = useRouter()
const config = useConfigStore()
const customerTheme = useCustomerThemeStore()
const previewBanner = ref<HTMLElement | null>(null)
watch(previewBanner, (element, _previous, onCleanup) => {
  const root = document.documentElement
  if (!element) { root.style.removeProperty('--app-theme-preview-height'); return }
  const measure = () => root.style.setProperty('--app-theme-preview-height', `${element.getBoundingClientRect().height}px`)
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  onCleanup(() => { observer.disconnect(); root.style.removeProperty('--app-theme-preview-height') })
}, { flush: 'post' })
// Wait for initial navigation: otherwise Vue Router can restore the preview token
// into the address bar after it has already been removed by the theme store.
void router.isReady().then(async () => {
  customerTheme.initPreview()
  if ('themePreview' in router.currentRoute.value.query) {
    const query = { ...router.currentRoute.value.query }
    delete query.themePreview
    await router.replace({ query })
  }
  await customerTheme.load()
})
function refreshTheme() { if (document.visibilityState === 'visible') void customerTheme.load() }
onMounted(() => document.addEventListener('visibilitychange', refreshTheme))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshTheme))

void config.ensureLoaded().catch(() => undefined)
watchEffect(() => {
  document.title = documentTitleFor(route, customerTheme.theme?.brand?.name || config.config.siteName)
})
</script>

<template>
  <SkipLink />
  <aside v-if="customerTheme.preview" ref="previewBanner" class="theme-preview-banner" aria-label="主题预览">
    <span role="status">{{ customerTheme.error || `正在预览：${customerTheme.theme?.name || '加载中'}（仅当前窗口生效）` }}</span>
    <button type="button" @click="customerTheme.exitPreview">退出预览</button>
  </aside>
  <router-view />
</template>

<style scoped>
.theme-preview-banner { position: sticky; top: 0; z-index: 110; display: flex; align-items: center; justify-content: space-between; gap: var(--app-space-4); padding: var(--app-space-4) var(--app-space-8); color: var(--td-text-color-primary); background: var(--td-bg-color-container); border-bottom: 1px solid var(--td-component-border); font: var(--app-type-caption); }
.theme-preview-banner button { min-height: 44px; flex-shrink: 0; color: var(--td-brand-color); background: transparent; border: 0; cursor: pointer; font: var(--app-type-emphasis-sm); }
</style>
