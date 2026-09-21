<script setup lang="ts">
import { Tag } from 'tdesign-mobile-vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import { demandDateText } from '@/constants/demand'
import type { Demand } from '@/types'
import { formatZhNumber } from '@/utils/format'

/* 项目列表卡片：分类/标题/发布方/日期/响应数 + 已响应标记。 */
defineProps<{ demand: Demand; responded: boolean; to: string }>()
</script>

<template>
  <router-link class="demand-item m-card pressable" :to="to">
    <div class="d-head">
      <Tag class="d-cat" size="small" variant="light" theme="primary">{{ demand.categoryLabel }}</Tag>
      <h3 class="d-title">{{ demand.title }}</h3>
    </div>
    <div class="d-meta">
      <span class="d-pub">
        <IdentityTag :type="demand.publisherIdentity" />
        <span>{{ demand.publisherName }}</span>
      </span>
      <span v-if="demandDateText(demand)">{{ demandDateText(demand) }}</span>
    </div>
    <Tag v-if="responded" class="d-flag" size="small" variant="light" theme="success">已响应</Tag>
    <p class="d-resp" :class="{ 'is-zero': !demand.responseCount }">{{ formatZhNumber(demand.responseCount) }} 人响应</p>
  </router-link>
</template>

<style scoped>
.demand-item {
  display: block;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.d-head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-4);
}

.d-cat {
  flex-shrink: 0;
}

.d-title {
  margin:0;
  flex: 1;
  min-width: 0;
  font-size: var(--app-font-subtitle);
  font-weight: 600;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.d-meta {
  display: flex;
  align-items: center;
  gap: var(--app-space-6);
  margin-top: var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.d-pub {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-3);
}

.d-flag {
  align-self: flex-start;
  margin-top: var(--app-space-3);
}

.d-resp {
  margin: var(--app-space-3) 0 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
  font-weight: 600;
}

/* v45：0 响应不再是有效信号，撤掉品牌色强调，把强调色留给真的有人响应的需求 */
.d-resp.is-zero {
  color: var(--td-text-color-secondary);
  font-weight: 400;
}
</style>
