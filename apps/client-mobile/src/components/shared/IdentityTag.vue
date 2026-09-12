<script setup lang="ts">
import { computed } from 'vue'
import type { IdentityType } from '@/types'

/* 身份标签（双端通用）：社区身份=品牌蓝 light、个人用户/合作企业=default，
 * 与 admin IdentityTags / t-tag light 变体视觉口径一致。
 * 保持零组件库依赖，避免破坏双端分包隔离（plan §3.4）。 */
const props = defineProps<{ type: IdentityType }>()

const meta = computed(() => {
  switch (props.type) {
    case 'community_individual':
      return { label: '社区个体', tone: 'primary' }
    case 'community_enterprise':
      return { label: '社区企业', tone: 'primary' }
    case 'external_enterprise':
      return { label: '合作企业', tone: 'default' }
    default:
      return { label: '个人用户', tone: 'default' }
  }
})
</script>

<template>
  <span class="identity-tag" :class="meta.tone">{{ meta.label }}</span>
</template>

<style scoped>
.identity-tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  border-radius: var(--td-radius-small);
}

.identity-tag.primary {
  color: var(--td-brand-color);
  background-color: var(--td-brand-color-light);
}

.identity-tag.default {
  color: var(--td-text-color-secondary);
  background-color: var(--td-bg-color-container-hover);
}
</style>
