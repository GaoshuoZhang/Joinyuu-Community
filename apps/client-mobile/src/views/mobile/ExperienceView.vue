<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, List } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchExperience } from '@/api/experience'
import { fetchRealnameRights } from '@/api/me'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import LevelCardCarousel from '@/components/level/LevelCardCarousel.vue'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { experienceProgress } from '@/utils/experience'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'
import type { RealnameRightsGroup } from '@/types'

/* 我的等级：仅社区个体维度的等级与分级权益（左右滑动查看上/下一级） */
const { data, loading, error, run } = useAsyncList(() => fetchExperience())
const router = useRouter()
const records = computed(() => data.value?.records ?? [])
const rights = ref<RealnameRightsGroup[]>([])
const rightsLoading = ref(false)
const rightsError = ref('')
async function loadRights() {
  rightsLoading.value = true
  rightsError.value = ''
  try {
    /* 仅社区个体的分级权益（不含未实名/已实名个人、社区企业分组） */
    rights.value = (await fetchRealnameRights({ identityType: 'community_individual' }))
      .slice()
      .sort((a, b) => a.level - b.level)
  } catch {
    rightsError.value = '权益信息加载失败'
  } finally {
    rightsLoading.value = false
  }
}
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
onMounted(() => {
  run()
  loadRights()
})
</script>

<template>
  <div class="page-fade-in experience">
    <ListSkeleton v-if="loading || rightsLoading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data?.identityLabel" text="绑定社区个体身份后，经验与等级将在这里展示" action-text="查看关联身份" @action="router.push('/me/identities')" />
    <template v-else>
      <LevelCardCarousel
        v-if="rights.length"
        :groups="rights"
        :current-level="data.level"
        :current-experience="data.currentExperience"
        :progress-percent="progress?.percent ?? null"
        identity-label="社区个体"
        class="level-carousel"
      />
      <p v-if="rightsError" class="rights-error">{{ rightsError }}，<Button variant="text" size="small" theme="primary" @click="loadRights">重试</Button></p>
      <p v-if="progress && !progress.isHighestLevel" class="next-hint">
        距下一级还需 {{ formatZhNumber(progress.remaining ?? 0) }} 经验
      </p>
      <p v-else-if="progress?.isHighestLevel" class="next-hint">已达最高等级</p>
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

.level-carousel {
  margin-bottom:var(--app-space-4);
}

.next-hint {
  margin:0 0 var(--app-space-7);
  padding:0 var(--app-space-1);
  font: var(--app-type-caption);
  color:var(--td-text-color-secondary);
  text-align: center;
}

.rights-error {
  margin:0 0 var(--app-space-7);
  font: var(--app-type-caption);
  color:var(--td-text-color-secondary);
  text-align: center;
}

.retry-link {
  border: none;
  background: none;
  padding: 0;
  font: var(--app-type-caption);
  color: var(--td-brand-color);
  cursor: pointer;
  min-height: 44px;
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
  font: var(--app-type-body);
}

.meta {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.delta {
  font: var(--app-type-emphasis);
  color: var(--td-success-color);
}

.delta.neg {
  color: var(--td-error-color);
}
</style>
