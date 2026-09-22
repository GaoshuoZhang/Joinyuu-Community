<script setup lang="ts">
import { computed } from 'vue'

/**
 * 列表空态：区分「无数据」与「筛选无结果」。
 * 传入 query 时自动判断：除 page/pageSize（及 ignore 指定字段）外
 * 任一字段非空即视为筛选无结果，并展示「清除筛选」按钮。
 * 仅 null/undefined/空串/空数组算「未筛选」：数值 0 与布尔 false 是有效筛选值，
 * 若某字段的 0/false 并不代表筛选，请由调用方通过 ignore 显式排除。
 */
const props = withDefaults(
  defineProps<{
    query?: Record<string, unknown> | null
    ignore?: string[]
    description?: string
  }>(),
  { query: null, ignore: () => [], description: '暂无数据' },
)

const emit = defineEmits<{ (e: 'clear'): void }>()

const IGNORED_KEYS = ['page', 'pageSize']

const filtered = computed(() => {
  if (!props.query) return false
  return Object.entries(props.query).some(([key, value]) => {
    if (IGNORED_KEYS.includes(key) || props.ignore.includes(key)) return false
    if (value == null || value === '') return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim() !== ''
    return true
  })
})
</script>

<template>
  <t-empty :description="filtered ? '没有符合筛选条件的结果' : description">
    <!-- 默认仅「清除筛选」；业务侧额外操作经 #action 追加，无插槽时渲染结果不变 -->
    <template v-if="filtered || $slots.action" #action>
      <t-button v-if="filtered" variant="outline" size="small" @click="emit('clear')">清除筛选</t-button>
      <slot name="action" />
    </template>
  </t-empty>
</template>
