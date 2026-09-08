<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="page-header">
    <div>
      <!-- TDesign 排版组件：标题/段落，字号与间距由 tokens.css 的 .page-title/.page-desc 控制 -->
      <t-typography-title level="h2" class="page-title">{{ title }}</t-typography-title>
      <t-typography-paragraph v-if="description" class="page-desc">{{ description }}</t-typography-paragraph>
    </div>
    <div class="page-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
