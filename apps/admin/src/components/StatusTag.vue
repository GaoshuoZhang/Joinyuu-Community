<script setup lang="ts">
import { computed } from 'vue'
import { statusMap, type StatusEntity } from '@/constants/status'

/* 统一状态标签：所有列表/详情页必须用它渲染状态，禁止自造文案配色
 * scheduled 状态额外展示定时发布时间（替代"定时发布中"文案） */
const props = defineProps<{
  entity: StatusEntity
  value: string
  /** 定时发布时间（entity 为 demand/event/article 且 value 为 scheduled 时展示） */
  scheduledAt?: string
  /** 报名开关（entity 为 event 且 value 为 published 时，label 拼接 报名中/暂停报名） */
  enrollmentOpen?: boolean
  /** 标签尺寸：列表用默认 medium，抽屉/窄容器传 small；不传时保持 t-tag 默认尺寸 */
  size?: 'small' | 'medium' | 'large'
}>()

/* 词表未命中兜底文案：不把原始英文码直接暴露给使用者 */
const UNKNOWN_LABEL = '未知状态'

const isScheduled = computed(
  () =>
    (props.entity === 'demand' || props.entity === 'event' || props.entity === 'article') &&
    props.value === 'scheduled' &&
    !!props.scheduledAt,
)

const conf = computed(() => {
  const entityMap = statusMap[props.entity] as Record<string, { label: string; theme: 'default' | 'primary' | 'success' | 'warning' | 'danger' }>
  const base = entityMap[props.value] ?? { label: UNKNOWN_LABEL, theme: 'default' as const }
  if (props.entity === 'event' && props.value === 'published') {
    return { ...base, label: `已发布（${props.enrollmentOpen ? '报名中' : '暂停报名'}）` }
  }
  return base
})
</script>

<template>
  <t-tooltip v-if="isScheduled" :content="`到点自动发布：${scheduledAt}`">
    <t-tag :theme="conf.theme" variant="light" :size="size">定时发布 {{ scheduledAt }}</t-tag>
  </t-tooltip>
  <t-tag v-else :theme="conf.theme" variant="light" :size="size">{{ conf.label }}</t-tag>
</template>
