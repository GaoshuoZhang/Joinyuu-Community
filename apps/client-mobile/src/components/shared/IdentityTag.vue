<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'tdesign-mobile-vue'
import type { IdentityType } from '@/types'

/* 身份标签：TDesign Tag 轻封装（社区身份=品牌蓝 light、个人用户/合作企业=default），
 * 对外保留 type prop，内部实现统一走组件库。
 * official（社区自建需求）：文案取后台工作人员角色名快照（label prop），缺省回退「社区官方」。 */
const props = defineProps<{ type: IdentityType; label?: string }>()

const meta = computed(() => {
  switch (props.type) {
    case 'community_individual':
      return { label: '社区个体', tone: 'primary' as const }
    case 'community_enterprise':
      return { label: '社区企业', tone: 'primary' as const }
    case 'external_enterprise':
      return { label: '合作企业', tone: 'default' as const }
    case 'official':
      return { label: props.label?.trim() || '社区官方', tone: 'primary' as const }
    default:
      return { label: '个人用户', tone: 'default' as const }
  }
})
</script>

<template>
  <Tag :theme="meta.tone" variant="light" size="small">{{ meta.label }}</Tag>
</template>
