<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { List, Progress } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchExperience } from '@/api/experience'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { experienceProgress } from '@/utils/experience'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 我的等级：个人经验/等级（社区个体维度；无社区个体身份时为空态） */
const { data, loading, error, run } = useAsyncList(() => fetchExperience())
const router = useRouter()
const records = computed(() => data.value?.records ?? [])
const progress = computed(() => data.value ? experienceProgress(data.value) : null)
const { visibleItems, hasMore, showMore } = useIncrementalList(records)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
onMounted(run)
</script>

<template>
  <div class="page-fade-in experience">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data?.identityLabel" text="绑定社区个体身份后，经验与等级将在这里展示" action-text="查看关联身份" @action="router.push('/me/identities')" />
    <template v-else>
      <div class="level-card">
        <div class="level-head">
          <span class="identity">{{ data.identityLabel }}</span>
          <span class="lv tabular-nums">Lv.{{ data.level }} {{ data.levelName }}</span>
        </div>
        <!-- 经验进度：改用 TDesign Progress（line + 无内置百分比标签，说明文案仍在下方） -->
        <Progress
          theme="line"
          :percentage="progress?.percent ?? 0"
          :label="false"
          color="var(--td-text-color-anti)"
          track-color="color-mix(in srgb, var(--td-text-color-anti) 25%, transparent)"
        />
        <p v-if="progress?.isHighestLevel" class="bar-meta">当前 {{ formatZhNumber(data.currentExperience) }} 经验 · 已达最高等级</p>
        <p v-else class="bar-meta">当前 {{ formatZhNumber(data.currentExperience) }} 经验 · 距下一级还需 {{ formatZhNumber(progress?.remaining ?? 0) }} 经验</p>
      </div>
      <EmptyBlock v-if="!records.length" text="暂无经验记录，参与社区需求、项目协作或活动后将在这里展示" action-text="浏览需求" @action="router.push('/projects')" />
      <List v-else class="m-card ledger stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
        <div v-for="r in visibleItems" :key="r.id" class="row">
          <div>
            <p class="reason">{{ r.reason }}</p>
            <p class="meta">{{ formatLocalDateTime(r.at) }}</p>
          </div>
          <span class="delta" :class="{ neg: r.delta < 0 }">{{ r.delta >= 0 ? '+' : '' }}{{ formatZhNumber(r.delta) }}</span>
        </div>
      </List>
    </template>
  </div>
</template>

<style scoped>
.experience {
  padding:var(--app-space-8);
}


.level-card {
  padding:var(--app-space-9);
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  margin-bottom:var(--app-space-7);
}

.level-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom:var(--app-space-6);
}

.identity {
  font-size: var(--app-font-caption);
  opacity: 0.85;
}

.lv {
  font-size: var(--app-font-subtitle);
  font-weight: 600;
}

.bar-meta {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  opacity: 0.85;
}

.ledger {
  padding:var(--app-space-2) var(--app-space-7);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
  padding:var(--app-space-6) 0;
}

/* List 组件会在行尾常驻一个 loading wrapper 节点，:last-child 判定失效，改用相邻行画上边框（视觉等价） */
.row + .row {
  border-top: 1px solid var(--td-component-border);
}

.reason {
  margin:0 0 var(--app-space-2);
  font-size: var(--app-font-body);
}

.meta {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.delta {
  font-weight: 600;
  color: var(--td-success-color);
}

.delta.neg {
  color: var(--td-error-color);
}
</style>
