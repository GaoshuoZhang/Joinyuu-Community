<script setup lang="ts">
import type { Component } from 'vue'
import { computed, useAttrs, useSlots } from 'vue'
import { Link as TLink } from 'tdesign-vue-next'

const props = defineProps<{
  label: string
  value: number | string
  icon?: Component
  /** 数值颜色风格（透传 TStatistic：black/blue/red/orange/green），如健康状态着色 */
  color?: string
  /** 激活态（筛选卡片选中时高亮） */
  active?: boolean
  href?: string
  /** 加载态：透传 TStatistic，避免数据未就绪时先显示 0 造成误读 */
  loading?: boolean
}>()

const slots = useSlots()
const attrs = useAttrs()

/* 根元素按用途选择：有 href 走链接；只有点击行为（筛选卡片）走原生 button，
 * 保证键盘可聚焦、可用 Enter/Space 触发；纯展示卡片保持 div，不进入 Tab 序列。 */
const tag = computed(() => (props.href ? TLink : attrs.onClick ? 'button' : 'div'))
</script>

<template>
  <component
    :is="tag"
    :href="href"
    :type="tag === 'button' ? 'button' : undefined"
    class="stat-card"
    :class="{ 'is-active': active }"
    :aria-pressed="tag === 'button' ? String(!!active) : undefined"
  >
    <div v-if="icon" class="stat-icon">
      <component :is="icon" />
    </div>
    <div class="stat-main">
      <!-- TDesign 统计数值组件：title=指标名，value=数值（自动千分位） -->
      <t-statistic class="stat-body" :title="label" :value="value as number" :color="color" :loading="loading" />
      <div v-if="slots.sub" class="stat-sub"><slot name="sub" /></div>
    </div>
  </component>
</template>

<style scoped>
.stat-card.t-link {
  display: flex;
  padding: 16px;
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
}

/* 筛选卡片根元素是原生 button：清除 UA 默认字体/居中/外观，观感与展示型卡片一致 */
.stat-card:is(button) {
  font: inherit;
  color: inherit;
  text-align: left;
  white-space: normal;
  appearance: none;
}

.stat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}
</style>
