<script setup lang="ts">
import { watch } from 'vue'
import { Button, Empty } from 'tdesign-mobile-vue'
import { announce } from '@/utils/a11y'

/* 空状态 / 错误态占位：TDesign Empty 封装（action 插槽放 Button）。
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
    <Empty :description="text ?? '暂无数据'">
      <template v-if="actionText" #action>
        <Button theme="primary" variant="outline" size="small" @click="$emit('action')">{{ actionText }}</Button>
      </template>
    </Empty>
  </div>
</template>

<style scoped>
.empty-block {
  padding:var(--app-space-11) var(--app-space-8);
  text-align: center;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}
</style>
