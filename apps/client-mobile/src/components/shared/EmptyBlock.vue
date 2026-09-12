<script setup lang="ts">
import { Empty } from 'tdesign-mobile-vue'

/* 空状态占位：TDesign Empty 封装（保留统一容器样式与对外 text prop）。 */
defineProps<{ text?: string }>()
</script>

<template>
  <div class="empty-block">
    <Empty :description="text ?? '暂无数据'" />
  </div>
</template>

<style scoped>
.empty-block {
  padding: 24px 16px;
  text-align: center;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}
</style>
