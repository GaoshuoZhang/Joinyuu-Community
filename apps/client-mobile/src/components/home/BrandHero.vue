<script setup lang="ts">
import { computed } from 'vue'
import CustomerBrandLogo from '@/components/CustomerBrandLogo.vue'
import { brandHeadline, type CustomerTheme } from '@/utils/customerTheme'

const props = defineProps<{ brand: CustomerTheme['brand']; siteName: string }>()
const title = computed(() => brandHeadline({ ...props.brand, name: props.brand?.name || props.siteName }))
</script>

<template>
  <section class="brand-hero" :class="{ 'brand-hero--headline': brand?.headline }" aria-label="社区介绍">
    <div v-if="brand?.homeBackground" class="brand-hero-art" :style="{ backgroundImage: `url(${brand.homeBackground})` }" aria-hidden="true" />
    <CustomerBrandLogo :brand="brand" decorative />
    <p v-if="brand?.eyebrow" class="brand-hero-eyebrow">{{ brand.eyebrow }}</p>
    <h2 class="brand-hero-title">{{ title.before }}<span v-if="title.highlight" class="brand-hero-highlight">{{ title.highlight }}</span>{{ title.after }}</h2>
    <p v-if="brand?.slogan" class="brand-hero-description">{{ brand.slogan }}</p>
  </section>
</template>
