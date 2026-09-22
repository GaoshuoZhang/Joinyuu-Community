<script setup lang="ts">
import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import SkipLink from '@/components/shared/SkipLink.vue'
import { documentTitleFor } from '@/constants/pageTitles'
import { useConfigStore } from '@/stores/config'

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
</template>
