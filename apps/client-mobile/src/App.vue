<script setup lang="ts">
import { defineAsyncComponent, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { apiMode } from '@/api/http'
import SkipLink from '@/components/shared/SkipLink.vue'
import { documentTitleFor } from '@/constants/pageTitles'
import { useConfigStore } from '@/stores/config'

/* DevTools 仅在 mock 模式动态加载：http 模式下 apiMode 为常量、该分支被静态剔除，mock 代码不进入产物。 */
const DevTools = apiMode === 'mock' ? defineAsyncComponent(() => import('@/devtools/DevTools.vue')) : null

const route = useRoute()
const config = useConfigStore()

void config.ensureLoaded().catch(() => undefined)
watchEffect(() => {
  document.title = documentTitleFor(route, config.config.siteName)
})
</script>

<template>
  <SkipLink />
  <router-view />
  <DevTools v-if="DevTools" />
</template>
