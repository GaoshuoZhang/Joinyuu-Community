<script setup lang="ts">
/* 空状态占位（双端通用）：视觉对齐 TDesign Empty（插画区 + 描述文案）。
 * 保持零组件库依赖，避免破坏双端分包隔离（plan §3.4）。 */
defineProps<{ text?: string }>()
</script>

<template>
  <div class="empty-block">
    <span class="empty-icon">🏝️</span>
    <p class="empty-text">{{ text ?? '暂无数据' }}</p>
  </div>
</template>

<style scoped>
.empty-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.empty-icon {
  font-size: 32px;
  line-height: 1;
  opacity: 0.85;
}

.empty-text {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--td-text-color-placeholder);
}
</style>
