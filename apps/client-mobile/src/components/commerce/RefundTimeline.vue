<script setup lang="ts">
import { List } from 'tdesign-mobile-vue'
import type { CommerceRefundTimelineItem } from '@/types'

defineProps<{ items: CommerceRefundTimelineItem[] }>()
</script>

<template>
  <List class="timeline" :bordered="false" aria-label="退款进度">
    <div v-for="(item, index) in items" :key="`${item.title}-${index}`" class="timeline__item">
      <span class="timeline__dot" :class="{ 'timeline__dot--last': index === items.length - 1 }" aria-hidden="true" />
      <div class="timeline__body">
        <p class="timeline__title">{{ item.title }}</p>
        <p v-if="item.text" class="timeline__text">{{ item.text }}</p>
        <p v-if="item.at" class="timeline__time">{{ item.at }}</p>
      </div>
    </div>
  </List>
</template>

<style scoped>
.timeline {
  padding: 0;
}

.timeline__item {
  display: flex;
  gap: var(--app-space-4);
  padding: var(--app-space-3) 0;
  position: relative;
}

.timeline__dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--td-brand-color);
  position: relative;
}

.timeline__dot:not(.timeline__dot--last)::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 14px;
  width: 2px;
  height: calc(100% + 14px);
  background: var(--td-component-border);
}

.timeline__body {
  min-width: 0;
}

.timeline__title {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis-sm);
}

.timeline__text {
  margin: var(--app-space-1) 0 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
  overflow-wrap: anywhere;
}

.timeline__time {
  margin: var(--app-space-1) 0 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
  font-variant-numeric: tabular-nums;
}
</style>
