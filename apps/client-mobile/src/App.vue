<script setup lang="ts">
import { apiMode } from '@/api/http'
import DevTools from '@/devtools/DevTools.vue'
</script>

<template>
  <router-view />
  <DevTools v-if="apiMode === 'mock'" />
</template>
