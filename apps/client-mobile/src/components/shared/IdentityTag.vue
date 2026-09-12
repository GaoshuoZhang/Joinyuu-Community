<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'tdesign-mobile-vue'
import type { IdentityType } from '@/types'

/* 身份标签：TDesign Tag 轻封装（社区身份=品牌蓝 light、个人用户/合作企业=default），
 * 对外保留 type prop，内部实现统一走组件库。 */
const props = defineProps<{ type: IdentityType }>()

const meta = computed(() => {
  switch (props.type) {
    case 'community_individual':
      return { label: '社区个体', tone: 'primary' as const }
    case 'community_enterprise':
      return { label: '社区企业', tone: 'primary' as const }
    case 'external_enterprise':
      return { label: '合作企业', tone: 'default' as const }
    default:
      return { label: '个人用户', tone: 'default' as const }
  }
})
</script>

<template>
  <Tag :theme="meta.tone" variant="light" size="small">{{ meta.label }}</Tag>
</template>
