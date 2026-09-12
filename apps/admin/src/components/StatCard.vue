<script setup lang="ts">
import type { Component } from 'vue'
import { Link as TLink } from 'tdesign-vue-next'

defineProps<{
  label: string
  value: number | string
  icon?: Component
  /** 激活态（筛选卡片选中时高亮） */
  active?: boolean
  href?: string
}>()
</script>

<template>
  <component :is="href ? TLink : 'div'" :href="href" class="stat-card" :class="{ 'is-active': active }">
    <div v-if="icon" class="stat-icon">
      <component :is="icon" />
    </div>
    <!-- TDesign 统计数值组件：title=指标名，value=数值（自动千分位） -->
    <t-statistic class="stat-body" :title="label" :value="value as number" />
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
</style>
