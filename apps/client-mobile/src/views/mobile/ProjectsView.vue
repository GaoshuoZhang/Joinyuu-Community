<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Search, Tabs, TabPanel, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchDemands } from '@/api/demands'
import { useAuthStore } from '@/stores/auth'
import { useDict } from '@/composables/useDict'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { DEMAND_KINDS, demandDateText } from '@/constants/demand'
import type { Demand, DemandKind } from '@/types'

/* 项目页：三类需求选项卡，类型筛选在分页前执行。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { items: demandCategories } = useDict('demand_category')
const { items: industries } = useDict('industry')
const activeTab = ref<DemandKind>('task')
const categories = computed(() => activeTab.value === 'investment' ? industries.value : demandCategories.value)

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
    index: DEMAND_KINDS.findIndex((kind) => kind.kind === activeTab.value),
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
  const next = DEMAND_KINDS[swipe.index + (dx < 0 ? 1 : -1)]
  if (!next) return
  activeTab.value = next.kind
  swipe.switched = true
}

const PAGE_SIZE = 10
const page = ref(1)
const category = ref('')
const keyword = ref(String(route.query.keyword ?? ''))
const keywordInput = ref(keyword.value)
const items = ref<Demand[]>([])
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
      kind: activeTab.value,
      page: requestedPage,
      pageSize: PAGE_SIZE,
      category: category.value || undefined,
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
  window.clearTimeout(searchTimer)
  keywordInput.value = ''
  keyword.value = ''
  category.value = ''
  reload()
})

onMounted(run)

const hasMore = computed(() => items.value.length < total.value)
const firstLoading = computed(() => loading.value && items.value.length === 0)
const firstError = computed(() => error.value && items.value.length === 0)

function selectCategory(label: string) {
  category.value = category.value === label ? '' : label
  reload()
}

/* 实时搜索：输入防抖 300ms 后自动检索（清空即恢复全量） */
let searchTimer: number | undefined
watch(keywordInput, (val: string) => {
  window.clearTimeout(searchTimer)
  if (val.trim() === keyword.value) return
  searchTimer = window.setTimeout(() => {
    keyword.value = val.trim()
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

function onPublish() {
  router.push(auth.isLogged ? '/demands/new' : '/login?redirect=/demands/new')
}
</script>

<template>
  <div
    class="projects page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Tabs v-model="activeTab" class="top-tabs" :swipeable="false">
      <TabPanel v-for="kind in DEMAND_KINDS" :key="kind.kind" :value="kind.kind" :label="kind.title">
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

    <div v-if="firstLoading" class="hint">加载中…</div>
    <EmptyBlock v-else-if="firstError" :text="error" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无相关需求，换个筛选条件试试" />
    <div v-else class="list stagger">
      <article v-for="d in items" :key="d.id" class="demand-item m-card" @click="router.push(`/demands/${d.id}`)">
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
  border-radius: var(--td-radius-small);
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
