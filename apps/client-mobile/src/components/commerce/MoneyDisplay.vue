<script setup lang="ts">
import { computed } from 'vue'
import { formatFen } from '@/utils/money'

const props = withDefaults(
  defineProps<{
    fen: number
    size?: 'sm' | 'md' | 'lg'
    symbol?: boolean
    suffix?: string
  }>(),
  { size: 'md', symbol: true, suffix: '' },
)

const text = computed(() => formatFen(props.fen, { symbol: props.symbol }))
</script>

<template>
  <span class="money" :class="`money--${size}`">
    <span class="money__value">{{ text }}</span>
    <span v-if="suffix" class="money__suffix">{{ suffix }}</span>
  </span>
</template>

<style scoped>
.money {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: var(--td-text-color-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.money--sm {
  font: var(--app-type-emphasis-xs);
}

.money--md {
  font: var(--app-type-numeric);
}

.money--lg {
  font: var(--app-type-numeric-lg);
}

.money__suffix {
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
}
</style>
