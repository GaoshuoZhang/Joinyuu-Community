<script setup lang="ts">
import CategoryTag from '@/components/shared/CategoryTag.vue'
import StateTag from '@/components/shared/StateTag.vue'
import { demandDateText } from '@/constants/demand'
import type { Demand } from '@/types'
import { formatZhNumber } from '@/utils/format'

/* 需求列表卡片：与首页「最新需求」卡片（HomeFeedSection）同款三行结构——
 * 分类标签 + 响应数 / 标题（两行截断）/ 发布方 · 日期；额外保留「已响应」标记。
 * v53：发布方身份改以纯文本「发布者 xxx」呈现，不再用身份标签（身份标签留给名片/成员等场景）。 */
defineProps<{ demand: Demand; responded: boolean; to: string }>()
</script>

<template>
  <router-link class="demand-item m-card pressable" :to="to">
    <div class="d-head">
      <CategoryTag class="d-cat" :label="demand.categoryLabel" />
      <span v-if="demand.responseCount > 0" class="d-tag-meta d-resp">{{ formatZhNumber(demand.responseCount) }} 人响应</span>
      <StateTag v-if="responded" class="d-flag" kind="flag" value="responded" />
    </div>
    <h3 class="d-title">{{ demand.title }}</h3>
    <div class="d-meta">
      <span class="d-pub">发布者 {{ demand.publisherName }}</span>
      <span v-if="demandDateText(demand)">{{ demandDateText(demand) }}</span>
    </div>
  </router-link>
</template>

<style scoped>
.demand-item {
  display: block;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

/* 首行：分类标签 + 响应数 + 已响应标记（与 HomeFeedSection 的 d-head 同款） */
.d-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-4);
  margin-bottom: var(--app-space-4);
}

.d-cat {
  flex-shrink: 0;
}

.d-title {
  margin:0;
  font: var(--app-type-card-title);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* v53：响应数字号下调一档（网页>标题层级），仍保留强调色与等宽数字 */
.d-tag-meta {
  min-width: 0;
  font: var(--app-type-emphasis-xs);
  font-variant-numeric: tabular-nums;
}

.d-tag-meta.d-resp {
  color: var(--app-theme-link, var(--td-brand-color));
}

.d-flag {
  flex-shrink: 0;
}

.d-meta {
  display: flex;
  align-items: center;
  /* 长发布者名 + 日期不再横向溢出，超出时换行 */
  flex-wrap: wrap;
  column-gap: var(--app-space-6);
  row-gap: var(--app-space-3);
  margin-top: var(--app-space-4);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* 发布方为纯文本（身份标签已移除）：超长名单行省略，保留与日期的分隔 */
.d-pub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

