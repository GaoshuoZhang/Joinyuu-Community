<script setup lang="ts">
import type { Component } from 'vue'
import { useSlots } from 'vue'
import { Link as TLink } from 'tdesign-vue-next'

defineProps<{
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
</script>

<template>
  <component :is="href ? TLink : 'div'" :href="href" class="stat-card" :class="{ 'is-active': active }">
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

.stat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  overflow-wrap: anywhere;
}
</style>
