<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fab, List, PullDownRefresh, Tabs, TabPanel, Toast } from 'tdesign-mobile-vue'
import { AddIcon } from 'tdesign-icons-vue-next'
import { fetchDemands, fetchMyResponses } from '@/api/demands'
import { useAuthStore } from '@/stores/auth'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useAtTop } from '@/composables/useAtTop'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { useTabSwipe } from '@/composables/useTabSwipe'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import DemandFilterBar from '@/components/projects/DemandFilterBar.vue'
import DemandListCard from '@/components/projects/DemandListCard.vue'
import { DEMAND_KINDS } from '@/constants/demand'
import { REFRESH_LOADING_PROPS } from '@/constants/refresh'
import type { Demand, DemandKind } from '@/types'
import { formatZhNumber } from '@/utils/format'

useAnimSuppress()

/* 需求页：三类需求选项卡，类型筛选在分页前执行。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
/* v48：按用户要求移除分类筛选（原「分类字典 + chips」），筛选只保留类型选项卡与关键词搜索 */

/* v43：新增「全部」选项卡（默认），可跨类型浏览需求 */
const TABS: { kind: DemandKind | 'all'; title: string; searchPlaceholder: string }[] = [
  { kind: 'all', title: '全部', searchPlaceholder: '搜索需求关键词' },
  ...DEMAND_KINDS.map((k) => ({ kind: k.kind as DemandKind | 'all', title: k.title, searchPlaceholder: k.searchPlaceholder })),
]
const initialKind = TABS.some((tab) => tab.kind === String(route.query.kind)) ? (String(route.query.kind) as DemandKind | 'all') : 'all'
const activeTab = ref<DemandKind | 'all'>(initialKind)

/* v48：筛选条件（类型/关键词）同步到 URL，返回或分享可还原 */
function syncQuery() {
  const query: Record<string, string> = {}
  if (activeTab.value !== 'all') query.kind = activeTab.value
  if (keyword.value) query.q = keyword.value
  const current = route.query as Record<string, string>
  if (current.kind === query.kind && current.q === query.q && !current.category) return
  void router.replace({ query })
}

const { startSwipe, moveSwipe, cancelSwipe } = useTabSwipe(
  () => TABS.map((tab) => tab.kind),
  () => activeTab.value,
  (value) => (activeTab.value = value as DemandKind | 'all'),
)

const PAGE_SIZE = 10
const page = ref(1)
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
      keyword: keyword.value || undefined,
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

const hasFilter = computed(() => activeTab.value !== 'all' || Boolean(keyword.value))

/* v41：空态一键清除筛选；非「全部」Tab 由 watch(activeTab) 统一清筛选并 reload，避免重复请求 */
function clearFilters() {
  window.clearTimeout(searchTimer)
  if (activeTab.value !== 'all') {
    activeTab.value = 'all'
    return
  }
  keyword.value = ''
  keywordInput.value = ''
  syncQuery()
  reload()
}

const hasMore = computed(() => items.value.length < total.value)
const firstLoading = computed(() => loading.value && items.value.length === 0)
const firstError = computed(() => error.value && items.value.length === 0)
const footerState = computed(() => {
  if (!items.value.length || error.value) return ''
  if (loading.value) return 'loading'
  return hasMore.value ? 'load-more' : ''
})

/* v41：外部跳转（全局搜索「查看更多需求」等）带来的筛选参数同步 */
let applyingQuery = false
useRouteQuerySync('/projects', (q) => {
  const nextKind: DemandKind | 'all' = TABS.some((tab) => tab.kind === String(q.kind)) ? (String(q.kind) as DemandKind | 'all') : 'all'
  const nextKeyword = q.q ?? ''
  if (nextKind === activeTab.value && nextKeyword === keyword.value && nextKeyword === keywordInput.value) return
  applyingQuery = true
  activeTab.value = nextKind
  keyword.value = nextKeyword
  keywordInput.value = nextKeyword
  void nextTick(() => {
    applyingQuery = false
  })
  reload()
})

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
  if (!hasMore.value || loading.value) return
  const prev = page.value
  const tab = activeTab.value
  page.value = prev + 1
  await run()
  if (tab === activeTab.value && error.value) {
    page.value = prev
    Toast(error.value)
  }
}

function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}

/* v39：下拉刷新（保留当前筛选与分页） */
const refreshing = ref(false)
/* 离顶时禁用下拉刷新：库内 isReachTop 会被两行截断标题等 overflow 元素误判为已到顶 */
const atTop = useAtTop()

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
  <div>
  <!-- 下拉刷新统一为页面级（与首页/社区/广场/我的一致）：指示器出现在选项卡标题上方 -->
  <PullDownRefresh :value="refreshing" :disabled="!atTop" :loading-props="REFRESH_LOADING_PROPS" @refresh="onRefresh">
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
          <!-- 筛选条随页面滚动（不做吸顶）；下拉刷新覆盖整页 -->
          <DemandFilterBar
            v-model:keyword="keywordInput"
            :placeholder="kind.searchPlaceholder"
            class="filter-search"
          />

          <ListSkeleton v-if="firstLoading" :rows="3" />
          <EmptyBlock v-else-if="firstError" :text="error" action-text="重试" @action="reload" />
          <EmptyBlock v-else-if="items.length === 0 && hasFilter" text="没有符合筛选的需求" action-text="清除筛选" @action="clearFilters" />
          <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
          <EmptyBlock v-else-if="items.length === 0" text="暂无相关需求" action-text="发布需求" @action="onPublish" />
          <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
            <p class="list-count">共 {{ formatZhNumber(total) }} 条</p>
            <DemandListCard
              v-for="d in items"
              :key="d.id"
              :demand="d"
              :responded="respondedIds.has(d.id)"
              :to="`/demands/${d.id}`"
            />
          </List>
        </div>
      </TabPanel>
    </Tabs>
  </div>
  </PullDownRefresh>
  <!-- v47：发布入口改为悬浮 FAB（不再占据筛选区与列表之间的版面）；
       放在页面根节点（不在下拉刷新轨道内），避免被其 transform 容器改变 fixed 定位基准；
       bottom 用 --app-fab-offset（TabBar 高度 + 间距）并叠加底部安全区，避免刘海屏下压住 TabBar。 -->
  <Fab
    :icon="() => h(AddIcon, { size: '24px' })"
    style="right: var(--app-space-8); bottom: calc(var(--app-fab-offset) + env(safe-area-inset-bottom));"
    :button-props="{ 'aria-label': '发布需求' }"
    @click="onPublish"
  />
  </div>
</template>

<style scoped>
.projects {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.top-tabs {
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  padding-top:var(--app-space-6);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
  /* v47：底部留出 FAB 净空，滚动到底时加载更多 footer / 最后一项不被悬浮按钮遮挡 */
  padding-bottom: var(--app-fab-clearance);
}
</style>
