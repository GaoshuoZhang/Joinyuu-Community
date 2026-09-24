<script setup lang="ts">
import { Tag } from 'tdesign-mobile-vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import StateTag from '@/components/shared/StateTag.vue'
import { demandDateText } from '@/constants/demand'
import type { Demand } from '@/types'
import { formatZhNumber } from '@/utils/format'

/* 需求列表卡片：分类/标题/发布方/日期/响应数 + 已响应标记。 */
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
        <IdentityTag :type="demand.publisherIdentity" :label="demand.publisherIdentityLabel" />
        <span class="d-name">{{ demand.publisherName }}</span>
      </span>
      <span v-if="demandDateText(demand)">{{ demandDateText(demand) }}</span>
    </div>
    <!-- v48：「已响应」是本人参与标记，不是业务生命周期状态，统一走 StateTag（品牌色中间态），
         避免与「已发布/已立项」等 success 状态同色误读 -->
    <StateTag v-if="responded" class="d-flag" kind="flag" value="responded" />
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
  /* v48：与 MyDemandsView / MyResponsesView 的「同一层级列表卡片标题」口径一致（card-title 角色档） */
  font: var(--app-type-card-title);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.d-meta {
  display: flex;
  align-items: center;
  /* v48：长发布者名 + 日期不再横向溢出，超出时换行 */
  flex-wrap: wrap;
  gap: var(--app-space-6);
  margin-top: var(--app-space-4);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.d-pub {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-3);
  min-width: 0;
}

/* 发布者名单行超长时省略，保留身份图标与日期（flex-wrap 下仍可读） */
.d-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-flag {
  align-self: flex-start;
  margin-top: var(--app-space-3);
}

.d-resp {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-emphasis-sm);
  font-variant-numeric: tabular-nums;
  color: var(--td-brand-color);
}

/* v45：0 响应不再是有效信号，撤掉品牌色强调，把强调色留给真的有人响应的需求 */
.d-resp.is-zero {
  font: var(--app-type-body-sm);
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-secondary);
}
</style>
