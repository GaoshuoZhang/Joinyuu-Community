<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, List, TabPanel, Tabs, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchMyDemands, withdrawDemand } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { useTabSwipe } from '@/composables/useTabSwipe'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { DEMAND_KIND_LABELS } from '@/constants/demand'
import type { DemandKind, MyDemandItem } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 我的需求：选项卡「进行中 / 历史记录」。进行中 = 审核中/待发布/已发布等仍在流转的需求；
 * 历史记录 = 已立项/已关闭/已驳回/已撤回等终态需求。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyDemands)

type DemandTab = 'active' | 'history'
const TAB_VALUES = ['active', 'history'] as const
const TABS: { value: DemandTab; label: string }[] = [
  { value: 'active', label: '进行中' },
  { value: 'history', label: '历史记录' },
]
const activeTab = ref<DemandTab>('active')

const ACTIVE_STATUSES = new Set(['pending', 'pending_release', 'scheduled', 'published', 'selected'])
const HISTORY_STATUSES = new Set(['projected', 'closed', 'rejected', 'withdrawn'])

const items = computed(() => data.value ?? [])
const filtered = computed(() =>
  items.value.filter((d) => (activeTab.value === 'active' ? ACTIVE_STATUSES.has(d.status) : HISTORY_STATUSES.has(d.status))),
)
const { visibleItems, hasMore, showMore } = useIncrementalList(filtered)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
onMounted(run)

const { startSwipe, moveSwipe, cancelSwipe } = useTabSwipe(
  () => TAB_VALUES,
  () => activeTab.value,
  (value) => (activeTab.value = value as DemandTab),
)

const REVISE_ROUTES: Record<DemandKind, string> = {
  task: '/demands/new/task',
  investment: '/demands/new/invest',
  cooperation: '/demands/new/cooperation',
}

function onRevise(d: MyDemandItem) {
  void router.push(`${REVISE_ROUTES[d.kind ?? 'task']}?revise=${d.id}`)
}

function onWithdrawDemand(d: MyDemandItem) {
  DialogPlugin.confirm({
    title: '撤回需求',
    content: `撤回后「${d.title}」将不再进入审核，可在列表中修改重提。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      try {
        await withdrawDemand(d.id)
        Toast('已撤回需求')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}
</script>

<template>
  <div
    class="m-my-demands page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Button theme="primary" block class="publish" @click="router.push('/demands/new')">发布需求</Button>

    <Tabs v-model="activeTab" class="top-tabs" :swipeable="false">
      <TabPanel v-for="tab in TABS" :key="tab.value" :value="tab.value" :label="tab.label">
        <div v-if="activeTab === tab.value" class="tab-panel">
          <ListSkeleton v-if="loading && !items.length" />
          <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
          <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
          <EmptyBlock
            v-else-if="!filtered.length"
            :text="tab.value === 'active' ? '暂无进行中的需求' : '暂无历史需求'"
            action-text="发布需求"
            @action="router.push('/demands/new')"
          />
          <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
            <p class="list-count">共 {{ formatZhNumber(filtered.length) }} 条需求</p>
            <article v-for="d in visibleItems" :key="d.id" class="demand-row m-card">
              <router-link class="demand-main" :to="`/demands/${d.id}`">
                <div class="row-head">
                  <h2 class="row-title">{{ d.title }}</h2>
                  <StateTag kind="demand" :value="d.status" />
                </div>
                <div class="row-meta">
                  <Tag v-if="d.kind" class="kind" size="small" variant="light" theme="default">{{ DEMAND_KIND_LABELS[d.kind] }}</Tag>
                  <Tag class="cat" size="small" variant="light" theme="primary">{{ d.categoryLabel }}</Tag>
                  <span>{{ formatZhNumber(d.responseCount) }} 人响应</span>
                  <span class="row-more">查看详情<Icon aria-hidden="true" name="chevron-right" size="12px" /></span>
                </div>
                <p class="row-time">发布于 {{ formatLocalDateTime(d.createdAt) }}</p>
                <p v-if="d.rejectReason" class="reject">驳回原因：{{ d.rejectReason }}</p>
              </router-link>
              <div v-if="d.status === 'pending' || d.status === 'rejected' || d.status === 'withdrawn'" class="row-ops">
                <Button v-if="d.status === 'pending'" size="small" variant="outline" @click.stop="onWithdrawDemand(d)">撤回</Button>
                <Button v-if="d.status === 'rejected' || d.status === 'withdrawn'" size="small" theme="primary" variant="outline" @click.stop="onRevise(d)">修改重提</Button>
              </div>
            </article>
          </List>
        </div>
      </TabPanel>
    </Tabs>
  </div>
</template>

<style scoped>
.m-my-demands {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.top-tabs {
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding-top: var(--app-space-6);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.demand-main {
  display: block;
  color: inherit;
  text-decoration: none;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap:var(--app-space-4);
}

.row-title {
  margin:0;
  /* v48：列表卡片标题基准档（body + 600），与 DemandListCard / MyResponsesView 统一 */
  font-size: var(--app-font-body);
  font-weight: 600;
  line-height: 1.45;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-5);
  margin-top:var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.cat,
.kind {
  flex-shrink: 0;
}

.row-time {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.reject {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.row-ops {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}

.row-more {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-1);
  margin-left:auto;
  color: var(--td-brand-color);
  cursor: pointer;
}

</style>
