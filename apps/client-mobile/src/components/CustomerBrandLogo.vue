<script setup lang="ts">
import type { CustomerTheme } from '@/utils/customerTheme'

withDefaults(defineProps<{ brand: CustomerTheme['brand']; decorative?: boolean }>(), { decorative: false })
</script>

<template>
  <span v-if="brand?.logo" class="customer-brand-logo" :class="{ 'customer-brand-logo--wordmark': brand.logoShape === 'wordmark' }">
    <img class="customer-logo" :class="{ 'customer-logo--has-dark': brand.logoDark }" :src="brand.logo" :alt="decorative ? '' : brand.name || '社区标志'" />
    <img v-if="brand.logoDark" class="customer-logo customer-logo--dark" :src="brand.logoDark" :alt="decorative ? '' : brand.name || '社区标志'" />
  </span>
</template>
