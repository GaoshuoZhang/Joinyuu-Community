<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckTag, Icon, Image, Search, Tabs, TabPanel, PullDownRefresh, Tag } from 'tdesign-mobile-vue'
import { fetchEvents, fetchMyEnrollments } from '@/api/events'
import { useAuthStore } from '@/stores/auth'
import { fetchArticles, fetchColumns } from '@/api/contents'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityEvent, Article, ArticleColumn } from '@/types'
import { onImageError } from '@/utils/imageFallback'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

useAnimSuppress()

/* 广场页：顶部「活动 / 资讯」两个选项卡，各带实时搜索（防抖 300ms）。
 * 活动展示进行中/已发布；资讯按栏目分类展示已发布文章。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const activeTab = ref(route.query.tab === 'articles' ? 'articles' : 'events')

const initialQ = String(route.query.q ?? '')
const eventKeywordInput = ref(activeTab.value === 'events' ? initialQ : '')
const articleKeywordInput = ref(activeTab.value === 'articles' ? initialQ : '')

/* v43：当前用户已报名的活动标记 */
const enrolledIds = ref<Set<string>>(new Set())
async function loadEnrolled() {
  if (!auth.isLogged) {
    enrolledIds.value = new Set()
    return
  }
  try {
    const activeStatuses = new Set(['pending', 'approved', 'waitlisted'])
    enrolledIds.value = new Set(
      (await fetchMyEnrollments())
        .filter((item) => activeStatuses.has(item.status))
        .map((item) => item.eventId),
    )
  } catch {
    /* 标记失败不影响列表 */
  }
}

const { data: events, loading: eventsLoading, error: eventsError, run: loadEvents } = useAsyncList<CommunityEvent[]>(
  () => fetchEvents({ keyword: eventKeywordInput.value.trim() || undefined }),
)
const { data: columnData, run: loadColumns } = useAsyncList<ArticleColumn[]>(fetchColumns)
const activeColumn = ref(String(route.query.column ?? ''))
const { data: articleData, loading: articlesLoading, error: articlesError, run: loadArticles } = useAsyncList<Article[]>(() =>
  fetchArticles({ column: activeColumn.value || undefined, keyword: articleKeywordInput.value.trim() || undefined }),
)

/* v40：Tab/关键词/栏目同步 URL */
function syncQuery() {
  const keyword = activeTab.value === 'events' ? eventKeywordInput.value : articleKeywordInput.value
  const query: Record<string, string> = { tab: activeTab.value }
  if (keyword.trim()) query.q = keyword.trim()
  if (activeTab.value === 'articles' && activeColumn.value) query.column = activeColumn.value
  const current = route.query as Record<string, string>
  if (current.tab === query.tab && current.q === query.q && current.column === query.column) return
  void router.replace({ query })
}

const columns = computed(() => columnData.value ?? [])
const articles = computed(() => articleData.value ?? [])
const eventsEmpty = computed(() => !eventsLoading.value && !eventsError.value && (events.value ?? []).length === 0)
const articlesEmpty = computed(() => !articlesLoading.value && !articlesError.value && articles.value.length === 0)

/* v39：下拉刷新 */
const refreshing = ref(false)

async function onRefresh() {
  refreshing.value = true
  try {
    await Promise.all([loadEvents(), loadArticles(), loadEnrolled()])
  } finally {
    setTimeout(() => {
      refreshing.value = false
    }, 300)
  }
}

onMounted(() => {
  loadEvents()
  loadColumns()
  loadArticles()
  void loadEnrolled()
})

/* v43：进入不再自动重载活动与资讯（下拉刷新已覆盖），仅同步「已报名」标记 */
useRefreshOnActivate(() => {
  void loadEnrolled()
})

/* 实时搜索：输入防抖 300ms 后自动检索（清空即恢复全量） */
let eventTimer: number | undefined
let articleTimer: number | undefined
let applyingRouteQuery = false
watch(eventKeywordInput, () => {
  if (applyingRouteQuery) return
  window.clearTimeout(eventTimer)
  eventTimer = window.setTimeout(() => {
    syncQuery()
    loadEvents()
  }, 300)
})
watch(articleKeywordInput, () => {
  if (applyingRouteQuery) return
  window.clearTimeout(articleTimer)
  articleTimer = window.setTimeout(() => {
    syncQuery()
    loadArticles()
  }, 300)
})
watch(activeTab, () => {
  if (applyingRouteQuery) return
  if (activeTab.value === 'events') activeColumn.value = ''
  syncQuery()
})
onBeforeUnmount(() => {
  window.clearTimeout(eventTimer)
  window.clearTimeout(articleTimer)
})

useRouteQuerySync('/plaza', (query) => {
  const nextTab = query.tab === 'articles' ? 'articles' : 'events'
  const nextKeyword = query.q ?? ''
  const nextColumn = nextTab === 'articles' ? query.column ?? '' : ''
  const currentKeyword = nextTab === 'articles' ? articleKeywordInput.value : eventKeywordInput.value
  if (nextTab === activeTab.value && nextKeyword === currentKeyword && nextColumn === activeColumn.value) return

  window.clearTimeout(eventTimer)
  window.clearTimeout(articleTimer)
  applyingRouteQuery = true
  activeTab.value = nextTab
  if (nextTab === 'articles') {
    articleKeywordInput.value = nextKeyword
    activeColumn.value = nextColumn
    loadArticles()
  } else {
    eventKeywordInput.value = nextKeyword
    activeColumn.value = ''
    loadEvents()
  }
  void nextTick(() => {
    applyingRouteQuery = false
  })
})

function pickColumn(label: string) {
  activeColumn.value = label
  syncQuery()
  loadArticles()
}

function clearEventFilters() {
  eventKeywordInput.value = ''
}

function clearArticleFilters() {
  articleKeywordInput.value = ''
  activeColumn.value = ''
  syncQuery()
  loadArticles()
}
</script>

<template>
  <PullDownRefresh :value="refreshing" @refresh="onRefresh">
  <div class="page-fade-in m-plaza">
    <Tabs v-model="activeTab" class="top-tabs">
      <TabPanel value="events" label="活动">
        <Search v-model="eventKeywordInput" class="tab-search" placeholder="搜索活动关键词…" />
        <ListSkeleton v-if="eventsLoading && !(events ?? []).length" />
        <EmptyBlock v-else-if="eventsError" :text="eventsError" action-text="重试" @action="loadEvents" />
        <EmptyBlock
          v-else-if="eventsEmpty"
          text="暂无符合条件的活动"
          :action-text="eventKeywordInput ? '清除搜索' : undefined"
          @action="clearEventFilters"
        />
        <div v-else class="stagger list">
          <p class="list-count">共 {{ formatZhNumber(events?.length ?? 0) }} 场活动</p>
          <article
            v-for="ev in events"
            :key="ev.id"
            class="item m-card" v-pressable
            @click="router.push(`/events/${ev.id}`)"
          >
            <Image v-if="ev.coverUrl" class="card-cover" :src="ev.coverUrl" :alt="ev.title" fit="cover" lazy @error="onImageError" />
            <div v-else class="card-cover card-cover-fallback"><Icon aria-hidden="true" name="calendar" size="28px" /></div>
            <div class="row-head">
              <Tag class="type-tag" size="small" variant="light" theme="primary">{{ ev.typeLabel }}</Tag>
              <Tag v-if="enrolledIds.has(ev.id)" class="enrolled-flag" size="small" variant="light" theme="success">已报名</Tag>
              <span class="capacity">人数限制 {{ formatZhNumber(ev.capacity) }} 人</span>
            </div>
            <h2 class="title">{{ ev.title }}</h2>
            <p class="meta event-meta">
              <span class="event-meta-item">
                <Icon aria-hidden="true" class="event-meta-icon" name="time" size="14px" />
                <span>{{ formatLocalDateTime(ev.startTime) }}</span>
              </span>
              <span class="event-meta-item">
                <Icon aria-hidden="true" class="event-meta-icon" name="location" size="14px" />
                <span>{{ ev.location }}</span>
              </span>
            </p>
          </article>
        </div>
      </TabPanel>

      <TabPanel value="articles" label="资讯">
        <Search v-model="articleKeywordInput" class="tab-search" placeholder="搜索资讯关键词…" />
        <div class="chips">
          <CheckTag
            class="chip"
            size="medium"
            variant="light"
            :checked="activeColumn === ''"
            @change="pickColumn('')"
          >
            全部
          </CheckTag>
          <CheckTag
            v-for="c in columns"
            :key="c.code"
            class="chip"
            size="medium"
            variant="light"
            :checked="activeColumn === c.label"
            @change="pickColumn(c.label)"
          >
            {{ c.label }}
          </CheckTag>
        </div>

        <ListSkeleton v-if="articlesLoading && !articles.length" />
        <EmptyBlock v-else-if="articlesError" :text="articlesError" action-text="重试" @action="loadArticles" />
        <EmptyBlock
          v-else-if="articlesEmpty"
          text="暂无相关资讯"
          :action-text="articleKeywordInput || activeColumn ? '清除筛选' : undefined"
          @action="clearArticleFilters"
        />
        <div v-else class="stagger list">
          <p class="list-count">共 {{ formatZhNumber(articles?.length ?? 0) }} 篇文章</p>
          <article
            v-for="a in articles"
            :key="a.id"
            class="item m-card" v-pressable
            @click="router.push(`/articles/${a.id}`)"
          >
            <Image v-if="a.coverUrl" class="card-cover" :src="a.coverUrl" :alt="a.title" fit="cover" lazy @error="onImageError" />
            <div v-else class="card-cover card-cover-fallback"><Icon aria-hidden="true" name="image" size="28px" /></div>
            <Tag class="col-tag" size="small" variant="light" theme="primary">{{ a.columnLabel }}</Tag>
            <p class="title">{{ a.title }}</p>
            <p class="summary">{{ a.summary }}</p>
            <p class="meta">{{ a.authorName }} · {{ formatLocalDateTime(a.publishedAt) }} · {{ formatZhNumber(a.views) }} 次浏览</p>
          </article>
        </div>
      </TabPanel>
    </Tabs>
  </div>
  </PullDownRefresh>
</template>

<style scoped>
.m-plaza {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.top-tabs {
  /* 标题条白底（区别于页面灰底，可见可点），内容卡片保留白底 */
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-search {
  /* 与选项卡标题条拉开间距 */
  margin-top:var(--app-space-6);
  margin-bottom:var(--app-space-6);
}


.chips {
  display: flex;
  gap:var(--app-space-4);
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom:var(--app-space-6);
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.item {
  cursor: pointer;
  overflow: hidden;
}

.card-cover {
  display: block;
  width: calc(100% + var(--app-space-8) * 2);
  height: 132px;
  margin: calc(var(--app-space-8) * -1) calc(var(--app-space-8) * -1) var(--app-space-6);
}

/* 无封面时收敛为品牌浅底条形占位，避免大块灰底空洞 */
.card-cover-fallback {
  display: grid;
  place-items: center;
  height: 96px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom:var(--app-space-4);
}

.enrolled-flag {
  flex-shrink: 0;
}

.type-tag,
.col-tag {
  flex-shrink: 0;
}

.capacity {
  margin-left:auto;
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
}

.title {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-body);
  line-height: 1.4;
}

.summary {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.event-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.event-meta-item {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-2);
}

.event-meta-icon {
  flex-shrink: 0;
}
</style>
