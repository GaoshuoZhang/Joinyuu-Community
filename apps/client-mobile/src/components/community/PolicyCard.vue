<script setup lang="ts">
import { Tag } from 'tdesign-mobile-vue'
import type { CommunityPolicy } from '@/types'
import { formatLocalDate, formatLocalDateTime } from '@/utils/format'

/* 社区政策列表卡：分类 + 更新时间 + 标题 + 摘要。 */
defineProps<{ policy: CommunityPolicy }>()
defineEmits<{ open: [] }>()
</script>

<template>
  <article class="policy-card m-card pressable" v-pressable @click="$emit('open')">
    <div class="row-head">
      <Tag class="cat-tag" size="small" variant="light" theme="primary">{{ policy.category }}</Tag>
      <span class="updated">更新 {{ policy.updatedAt.length === 10 ? formatLocalDate(policy.updatedAt) : formatLocalDateTime(policy.updatedAt) }}</span>
    </div>
    <h3 class="title">{{ policy.title }}</h3>
    <p class="summary">{{ policy.summary }}</p>
  </article>
</template>

<style scoped>
.policy-card {
  cursor: pointer;
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--app-space-5);
  margin-bottom: var(--app-space-4);
}

.cat-tag {
  flex-shrink: 0;
}

.updated {
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.title {
  margin: 0;
  font: var(--app-type-card-title);
  color: var(--td-text-color-primary);
}

.summary {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
