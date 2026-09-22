<script setup lang="ts">
import { inject } from 'vue'

defineProps<{
  title: string
  description?: string
}>()

/* 聚合页（如「角色与账号」「日志与审计」）provide 本标记后，
 * 子面板自带的 PageHeader 不再渲染，避免标题重复。
 * 取代旧版 :deep(.page-header) { display: none } 的 CSS hack */
const embedded = inject('page-header:embedded', false)
</script>

<template>
  <div v-if="!embedded" class="page-header">
    <div>
      <!-- TDesign 排版组件：标题/段落，字号与间距由 tokens.css 的 .page-title/.page-desc 控制 -->
      <t-typography-title level="h2" class="page-title">{{ title }}</t-typography-title>
      <t-typography-paragraph v-if="description" class="page-desc">{{ description }}</t-typography-paragraph>
    </div>
    <!-- 无操作区时不渲染右列：空 div 的 flex-shrink:0 会占位挤压标题 -->
    <div v-if="$slots.actions" class="page-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
