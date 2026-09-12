<script setup lang="ts">
import { computed } from 'vue'

/* 状态标签（双端通用）：kind 决定状态集；配色取 TDesign t-tag light 变体，
 * 与 admin 的 StatusTag（t-tag variant="light"）视觉口径一致。
 * 刻意不引入组件库：桌面/移动分属两个 TDesign 包，共享组件一旦引入任一包
 * 都会把该包代码带进另一端的 chunk，破坏双端分包隔离（plan §3.4）。 */
const props = defineProps<{ kind: 'demand' | 'enroll' | 'order' | 'reservation' | 'article' | 'application'; value: string }>()

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

const map: Record<string, Record<string, { label: string; tone: Tone }>> = {
  demand: {
    pending: { label: '待审核', tone: 'warning' },
    published: { label: '已发布', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    closed: { label: '已关闭', tone: 'default' },
  },
  enroll: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    cancelled: { label: '已取消', tone: 'default' },
  },
  order: {
    pending_shipment: { label: '待发货', tone: 'warning' },
    shipped: { label: '已发货', tone: 'primary' },
    completed: { label: '已完成', tone: 'success' },
  },
  reservation: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    cancelled: { label: '已取消', tone: 'default' },
  },
  article: {
    pending: { label: '待审核', tone: 'warning' },
    pending_release: { label: '待发布', tone: 'primary' },
    rejected: { label: '已驳回', tone: 'danger' },
    published: { label: '已发布', tone: 'success' },
  },
  application: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
  },
}

const meta = computed(() => map[props.kind]?.[props.value] ?? { label: props.value, tone: 'default' as Tone })
</script>

<template>
  <span class="state-tag" :class="meta.tone">{{ meta.label }}</span>
</template>

<style scoped>
.state-tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  border-radius: var(--td-radius-small);
}

.state-tag.default {
  color: var(--td-text-color-primary);
  background-color: var(--td-bg-color-container-hover);
}

.state-tag.primary {
  color: var(--td-brand-color);
  background-color: var(--td-brand-color-light);
}

.state-tag.success {
  color: var(--td-success-color);
  background-color: var(--td-success-color-light);
}

.state-tag.warning {
  color: var(--td-warning-color);
  background-color: var(--td-warning-color-light);
}

.state-tag.danger {
  color: var(--td-error-color);
  background-color: var(--td-error-color-light);
}
</style>
