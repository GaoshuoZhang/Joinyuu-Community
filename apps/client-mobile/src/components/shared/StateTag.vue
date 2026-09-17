<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'tdesign-mobile-vue'

/* 状态标签：TDesign Tag 轻封装（kind 决定状态集，配色与 admin StatusTag 口径一致：
 * warning=待定 / success=通过 / danger=驳回 / primary=中间态 / default=终态）。 */
const props = defineProps<{ kind: 'demand' | 'enroll' | 'order' | 'reservation' | 'article' | 'application'; value: string }>()

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

const map: Record<string, Record<string, { label: string; tone: Tone }>> = {
  demand: {
    pending: { label: '待审核', tone: 'warning' },
    pending_release: { label: '待发布', tone: 'primary' },
    scheduled: { label: '定时发布中', tone: 'primary' },
    published: { label: '已发布', tone: 'success' },
    selected: { label: '已选定', tone: 'primary' },
    projected: { label: '已立项', tone: 'success' },
    withdrawn: { label: '已撤回', tone: 'default' },
    rejected: { label: '已驳回', tone: 'danger' },
    appealed: { label: '申诉中', tone: 'warning' },
    closed: { label: '已关闭', tone: 'default' },
  },
  enroll: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    waitlisted: { label: '候补中', tone: 'primary' },
    rejected: { label: '已驳回', tone: 'danger' },
    cancelled: { label: '已取消', tone: 'default' },
  },
  order: {
    pending_shipment: { label: '待发货', tone: 'warning' },
    shipped: { label: '已发货', tone: 'primary' },
    pending_use: { label: '待使用', tone: 'primary' },
    completed: { label: '已完成', tone: 'success' },
    cancelled: { label: '已取消', tone: 'default' },
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
    withdrawn: { label: '已撤回', tone: 'default' },
    published: { label: '已发布', tone: 'success' },
  },
  application: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    withdrawn: { label: '已撤回', tone: 'default' },
  },
}

const meta = computed(() => map[props.kind]?.[props.value] ?? { label: props.value, tone: 'default' as Tone })
</script>

<template>
  <Tag :theme="meta.tone" variant="light" size="small">{{ meta.label }}</Tag>
</template>
