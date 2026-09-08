<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: number | string
  icon?: Component
  /** 激活态（筛选卡片选中时高亮） */
  active?: boolean
}>()
</script>

<template>
  <div class="stat-card" :class="{ 'is-active': active }">
    <div v-if="icon" class="stat-icon">
      <component :is="icon" />
    </div>
    <!-- TDesign 统计数值组件：title=指标名，value=数值（自动千分位） -->
    <t-statistic class="stat-body" :title="label" :value="value as number" />
  </div>
</template>
