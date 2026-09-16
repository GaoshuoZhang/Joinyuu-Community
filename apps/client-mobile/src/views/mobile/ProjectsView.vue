<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, PullDownRefresh, Search, Tabs, TabPanel, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchDemands, fetchMyResponses } from '@/api/demands'
import { useAuthStore } from '@/stores/auth'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { useDict } from '@/composables/useDict'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { DEMAND_KINDS, demandDateText } from '@/constants/demand'
import type { Demand, DemandKind } from '@/types'

useAnimSuppress()

/* 项目页：三类需求选项卡，类型筛选在分页前执行。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { items: demandCategories, error: demandCategoryError, reload: reloadDemandCategories } = useDict('demand_category')
const { items: industries, error: industryError, reload: reloadIndustries } = useDict('industry')
const filterDictError = computed(() => (activeTab.value === 'investment' ? industryError.value : demandCategoryError.value))
function retryFilterDict() {
  if (activeTab.value === 'investment') reloadIndustries()
  else reloadDemandCategories()
}
/* v43：新增「全部」选项卡（默认），可跨类型浏览需求 */
const TABS: { kind: DemandKind | 'all'; title: string; searchPlaceholder: string }[] = [
  { kind: 'all', title: '全部', searchPlaceholder: '搜索需求关键词' },
  ...DEMAND_KINDS.map((k) => ({ kind: k.kind as DemandKind | 'all', title: k.title, searchPlaceholder: k.searchPlaceholder })),
]
const SORTS = [
  { value: 'latest' as const, label: '最新' },
  { value: 'hot' as const, label: '响应最多' },
]
const initialKind = TABS.some((tab) => tab.kind === String(route.query.kind)) ? (String(route.query.kind) as DemandKind | 'all') : 'all'
const activeTab = ref<DemandKind | 'all'>(initialKind)
const sort = ref<'latest' | 'hot'>(route.query.sort === 'hot' ? 'hot' : 'latest')
const categories = computed(() => activeTab.value === 'investment' ? industries.value : demandCategories.value)

/* v39：筛选条件（类型/分类/关键词）同步到 URL，返回或分享可还原；v40：追加排序 */
function syncQuery() {
  const query: Record<string, string> = {}
  if (activeTab.value !== 'all') query.kind = activeTab.value
  if (category.value) query.category = category.value
  if (keyword.value) query.q = keyword.value
  if (sort.value !== 'latest') query.sort = sort.value
  const current = route.query as Record<string, string>
  if (current.kind === query.kind && current.category === query.category && current.q === query.q && current.sort === query.sort) return
  void router.replace({ query })
}

// 与社区页一致的滑动体验：滑动中越过阈值即切换（TDesign 原生手感）；
// 额外限制每次手势只切换一项，避免 TDesign 1.16.2 连续切换导致的跳项。
let swipe: { identifier: number; x: number; y: number; index: number; switched: boolean } | null = null

function cancelSwipe() {
  swipe = null
}

function startSwipe(event: TouchEvent) {
  cancelSwipe()
  const target = event.target
  if (event.touches.length !== 1 || !(target instanceof Element)) return
  if (!target.closest('.t-tabs__content') || target.closest('.chips, input, textarea')) return
  const touch = event.touches[0]
  swipe = {
    identifier: touch.identifier,
    x: touch.clientX,
    y: touch.clientY,
    index: TABS.findIndex((kind) => kind.kind === activeTab.value),
    switched: false,
  }
}

function moveSwipe(event: TouchEvent) {
  if (!swipe || swipe.switched) return
  if (event.touches.length !== 1) return cancelSwipe()
  const touch = event.touches[0]
  const dx = touch.clientX - swipe.x
  const dy = touch.clientY - swipe.y
  if (Math.abs(dx) <= Math.abs(dy)) return
  if (event.cancelable) event.preventDefault()
  if (Math.abs(dx) < 40) return
  const next = TABS[swipe.index + (dx < 0 ? 1 : -1)]
  if (!next) return
  activeTab.value = next.kind
  swipe.switched = true
}

const PAGE_SIZE = 10
const page = ref(1)
const category = ref(String(route.query.category ?? ''))
const keyword = ref(String(route.query.q ?? ''))
const keywordInput = ref(keyword.value)
const items = ref<Demand[]>([])
/* v43：当前用户已响应的需求标记 */
const respondedIds = ref<Set<string>>(new Set())
async function loadResponded() {
  if (!auth.isLogged) return
  try {
    respondedIds.value = new Set((await fetchMyResponses()).map((r) => r.demandId))
  } catch {
    /* 标记失败不影响列表 */
  }
}
const total = ref(0)

const loading = ref(false)
const error = ref('')
let requestId = 0
async function run() {
  const id = ++requestId
  const requestedPage = page.value
  loading.value = true
  error.value = ''
  try {
    const res = await fetchDemands({
      kind: activeTab.value === 'all' ? undefined : activeTab.value,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      category: category.value || undefined,
      keyword: keyword.value || undefined,
      sort: sort.value,
    })
    if (id !== requestId) return
    items.value = requestedPage === 1 ? res.list : items.value.concat(res.list)
    total.value = res.total
  } catch (e) {
    if (id === requestId) error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    if (id === requestId) loading.value = false
  }
}

function reload() {
  page.value = 1
  items.value = []
  total.value = 0
  run()
}

watch(activeTab, () => {
  /* v41：URL 同步应用筛选时不触发清空/重复刷新 */
  if (applyingQuery) return
  window.clearTimeout(searchTimer)
  keywordInput.value = ''
  keyword.value = ''
  category.value = ''
  syncQuery()
  reload()
})

onMounted(() => {
  run()
  void loadResponded()
})

/* v38：返回时刷新当前页数据；v40 修复：回第 1 页避免重复追加 */
/* v43：进入不再自动重载列表（下拉刷新已覆盖），仅同步「已响应」标记 */
useRefreshOnActivate(() => {
  void loadResponded()
})

const hasFilter = computed(() => activeTab.value !== 'all' || Boolean(category.value) || Boolean(keyword.value) || sort.value !== 'latest')

/* v41：空态一键清除筛选 */
function clearFilters() {
  window.clearTimeout(searchTimer)
  activeTab.value = 'all'
  category.value = ''
  keyword.value = ''
  keywordInput.value = ''
  sort.value = 'latest'
  syncQuery()
  reload()
}

const hasMore = computed(() => items.value.length < total.value)
const firstLoading = computed(() => loading.value && items.value.length === 0)
const firstError = computed(() => error.value && items.value.length === 0)

function selectCategory(label: string) {
  category.value = category.value === label ? '' : label
  syncQuery()
  reload()
}

/* v41：外部跳转（全局搜索「查看更多项目」等）带来的筛选参数同步 */
let applyingQuery = false
useRouteQuerySync('/projects', (q) => {
  const nextKind: DemandKind | 'all' = TABS.some((tab) => tab.kind === String(q.kind)) ? (String(q.kind) as DemandKind | 'all') : 'all'
  const nextSort: 'latest' | 'hot' = q.sort === 'hot' ? 'hot' : 'latest'
  const nextCategory = q.category ?? ''
  const nextKeyword = q.q ?? ''
  if (nextKind === activeTab.value && nextSort === sort.value && nextCategory === category.value && nextKeyword === keyword.value && nextKeyword === keywordInput.value) return
  applyingQuery = true
  activeTab.value = nextKind
  sort.value = nextSort
  category.value = nextCategory
  keyword.value = nextKeyword
  keywordInput.value = nextKeyword
  void nextTick(() => {
    applyingQuery = false
  })
  reload()
})

/* v40：排序切换（最新 / 响应最多） */
function selectSort(value: 'latest' | 'hot') {
  if (sort.value === value) return
  sort.value = value
  syncQuery()
  reload()
}

/* 实时搜索：输入防抖 300ms 后自动检索（清空即恢复全量） */
let searchTimer: number | undefined
watch(keywordInput, (val: string) => {
  window.clearTimeout(searchTimer)
  if (val.trim() === keyword.value) return
  searchTimer = window.setTimeout(() => {
    keyword.value = val.trim()
    syncQuery()
    reload()
  }, 300)
})
onBeforeUnmount(() => window.clearTimeout(searchTimer))

async function loadMore() {
  if (loading.value) return
  const prev = page.value
  const tab = activeTab.value
  page.value = prev + 1
  await run()
  if (tab === activeTab.value && error.value) {
    page.value = prev
    Toast(error.value)
  }
}

/* v39：下拉刷新（保留当前筛选与分页） */
const refreshing = ref(false)

async function onRefresh() {
  refreshing.value = true
  try {
    /* v40 修复：刷新必须回到第 1 页，否则 run() 会把当前页追加造成重复 */
    page.value = 1
    items.value = []
    total.value = 0
    await Promise.all([run(), loadResponded()])
  } finally {
    setTimeout(() => {
      refreshing.value = false
    }, 300)
  }
}

function onPublish() {
  router.push(auth.isLogged ? '/demands/new' : '/login?redirect=/demands/new')
}
</script>

<template>
  <PullDownRefresh :value="refreshing" @refresh="onRefresh">
  <div
    class="projects page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Tabs v-model="activeTab" class="top-tabs" :swipeable="false">
      <TabPanel v-for="kind in TABS" :key="kind.kind" :value="kind.kind" :label="kind.title">
        <div v-if="activeTab === kind.kind" class="tab-content">
    <Button theme="primary" block class="publish" @click="onPublish">发布需求</Button>

    <Search v-model="keywordInput" class="search" :placeholder="kind.searchPlaceholder" />

    <div class="chips">
      <Tag :theme="category === '' ? 'primary' : 'default'" variant="light" size="medium" @click="selectCategory('')">
        全部
      </Tag>
      <Tag
        v-for="c in categories"
        :key="c.code"
        :theme="category === c.label ? 'primary' : 'default'"
        variant="light"
        size="medium"
        @click="selectCategory(c.label)"
      >
        {{ c.label }}
      </Tag>
    </div>
    <p v-if="filterDictError" class="dict-error">
      筛选项加载失败
      <a @click="retryFilterDict">重试</a>
    </p>

    <div class="sorts">
      <span class="sorts-label">排序</span>
      <Tag
        v-for="s in SORTS"
        :key="s.value"
        :theme="sort === s.value ? 'primary' : 'default'"
        variant="light"
        size="medium"
        @click="selectSort(s.value)"
      >
        {{ s.label }}
      </Tag>
    </div>

    <ListSkeleton v-if="firstLoading" :rows="3" />
    <EmptyBlock v-else-if="firstError" :text="error" action-text="重试" @action="reload" />
    <EmptyBlock v-else-if="items.length === 0 && hasFilter" text="没有符合筛选的需求" action-text="清除筛选" @action="clearFilters" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无相关需求" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ total }} 条</p>
      <article v-for="d in items" :key="d.id" class="demand-item m-card" v-pressable @click="router.push(`/demands/${d.id}`)">
        <div class="d-head">
          <span class="d-cat">{{ d.categoryLabel }}</span>
          <h3 class="d-title">{{ d.title }}</h3>
        </div>
        <div class="d-meta">
          <span class="d-pub">
            <IdentityTag :type="d.publisherIdentity" />
            <span class="d-pub-name">{{ d.publisherName }}</span>
          </span>
          <span v-if="demandDateText(d)">{{ demandDateText(d) }}</span>
        </div>
        <span v-if="respondedIds.has(d.id)" class="d-flag">已响应</span>
        <p class="d-resp">{{ d.responseCount }} 人响应</p>
      </article>
    </div>

    <Button v-if="hasMore && !firstLoading" theme="default" variant="outline" block class="more-btn" :loading="loading" @click="loadMore">
      加载更多
    </Button>
        </div>
      </TabPanel>
    </Tabs>
  </div>
  </PullDownRefresh>
</template>

<style scoped>
.projects {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-tabs {
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}

.search {
  margin-bottom: 2px;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.dict-error {
  margin: 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.sorts {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sorts-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.dict-error a {
  margin-left: 6px;
  color: var(--td-brand-color);
  cursor: pointer;
}

.hint {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  text-align: center;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.demand-item {
  cursor: pointer;
}

.d-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.d-cat {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}

.d-title {
  margin: 0;
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.d-pub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.d-flag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-success-color-1, #e8f8f0);
  color: var(--td-success-color);
}

.d-resp {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-brand-color);
  font-weight: 600;
}

.more-btn {
  margin-top: 4px;
}
</style>
