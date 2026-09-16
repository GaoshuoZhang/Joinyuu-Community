<script setup lang="ts">
import { watch } from 'vue'
import { Empty } from 'tdesign-mobile-vue'
import { announce } from '@/utils/a11y'

/* 空状态 / 错误态占位：TDesign Empty 封装。
 * v36：可选 actionText 提供重试或替代路径入口（错误态不再是无出路的死胡同）。
 * v38：文本变化时向屏幕阅读器播报（aria-live）。 */
const props = defineProps<{ text?: string; actionText?: string }>()
defineEmits<{ action: [] }>()

watch(
  () => props.text,
  (value) => {
    if (value) announce(value)
  },
  { immediate: true },
)
</script>

<template>
  <div class="empty-block">
    <Empty :description="text ?? '暂无数据'" />
    <button v-if="actionText" class="empty-action" type="button" @click="$emit('action')">{{ actionText }}</button>
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

.empty-action {
  min-height: 44px;
  min-width: 96px;
  margin-top: 12px;
  padding: 0 18px;
  border: 1px solid var(--td-brand-color);
  border-radius: var(--td-radius-default);
  background: transparent;
  color: var(--td-brand-color);
  font-size: 13px;
  cursor: pointer;
}
</style>
