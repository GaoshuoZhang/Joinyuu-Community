<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Tabs, TabPanel, PullDownRefresh, Tag } from 'tdesign-mobile-vue'
import { fetchEvents, fetchMyEnrollments } from '@/api/events'
import { useAuthStore } from '@/stores/auth'
import { fetchArticles, fetchColumns } from '@/api/contents'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityEvent, Article, ArticleColumn } from '@/types'

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
  if (!auth.isLogged) return
  try {
    enrolledIds.value = new Set((await fetchMyEnrollments()).map((item) => item.eventId))
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
watch(eventKeywordInput, () => {
  window.clearTimeout(eventTimer)
  eventTimer = window.setTimeout(() => {
    syncQuery()
    loadEvents()
  }, 300)
})
watch(articleKeywordInput, () => {
  window.clearTimeout(articleTimer)
  articleTimer = window.setTimeout(() => {
    syncQuery()
    loadArticles()
  }, 300)
})
watch(activeTab, () => syncQuery())
onBeforeUnmount(() => {
  window.clearTimeout(eventTimer)
  window.clearTimeout(articleTimer)
})

function pickColumn(label: string) {
  activeColumn.value = label
  syncQuery()
  loadArticles()
}
</script>

<template>
  <PullDownRefresh :value="refreshing" @refresh="onRefresh">
  <div class="page-fade-in m-plaza">
    <Tabs v-model="activeTab" class="top-tabs">
      <TabPanel value="events" label="活动">
        <Search v-model="eventKeywordInput" class="tab-search" placeholder="搜索活动关键词" />
        <ListSkeleton v-if="eventsLoading && !(events ?? []).length" />
        <EmptyBlock v-else-if="eventsError" :text="eventsError" action-text="重试" @action="loadEvents" />
        <EmptyBlock v-else-if="eventsEmpty" text="暂无符合条件的活动" />
        <div v-else class="stagger list">
          <p class="list-count">共 {{ events?.length ?? 0 }} 场活动</p>
          <article
            v-for="ev in events"
            :key="ev.id"
            class="item m-card" v-pressable
            @click="router.push(`/events/${ev.id}`)"
          >
            <div class="row-head">
              <span class="type-tag">{{ ev.typeLabel }}</span>
              <span v-if="enrolledIds.has(ev.id)" class="enrolled-flag">已报名</span>
              <span class="capacity">已报名 {{ ev.approvedCount }}/{{ ev.capacity }}</span>
            </div>
            <h3 class="title">{{ ev.title }}</h3>
            <p class="meta">🕐 {{ ev.startTime }} · 📍 {{ ev.location }}</p>
          </article>
        </div>
      </TabPanel>

      <TabPanel value="articles" label="资讯">
        <Search v-model="articleKeywordInput" class="tab-search" placeholder="搜索资讯关键词" />
        <div class="chips">
          <Tag
            class="chip"
            size="medium"
            :theme="activeColumn === '' ? 'primary' : 'default'"
            variant="light"
            @click="pickColumn('')"
          >
            全部
          </Tag>
          <Tag
            v-for="c in columns"
            :key="c.code"
            class="chip"
            size="medium"
            :theme="activeColumn === c.label ? 'primary' : 'default'"
            variant="light"
            @click="pickColumn(c.label)"
          >
            {{ c.label }}
          </Tag>
        </div>

        <ListSkeleton v-if="articlesLoading && !articles.length" />
        <EmptyBlock v-else-if="articlesError" :text="articlesError" action-text="重试" @action="loadArticles" />
        <EmptyBlock v-else-if="articlesEmpty" text="暂无相关资讯" />
        <div v-else class="stagger list">
          <p class="list-count">共 {{ articles?.length ?? 0 }} 篇文章</p>
          <article
            v-for="a in articles"
            :key="a.id"
            class="item m-card" v-pressable
            @click="router.push(`/articles/${a.id}`)"
          >
            <span class="col-tag">{{ a.columnLabel }}</span>
            <p class="title">{{ a.title }}</p>
            <p class="summary">{{ a.summary }}</p>
            <p class="meta">{{ a.authorName }} · {{ a.publishedAt }} · {{ a.views }} 次浏览</p>
          </article>
        </div>
      </TabPanel>
    </Tabs>
  </div>
  </PullDownRefresh>
</template>

<style scoped>
.m-plaza {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-tabs {
  /* 标题条白底（区别于页面灰底，可见可点），内容卡片保留白底 */
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-search {
  /* 与选项卡标题条拉开间距 */
  margin-top: 12px;
  margin-bottom: 12px;
}

.state {
  padding: 20px 0;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 12px;
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
  gap: 10px;
}

.item {
  cursor: pointer;
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.enrolled-flag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-success-color-1, #e8f8f0);
  color: var(--td-success-color);
}

.type-tag,
.col-tag {
  display: inline-block;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.capacity {
  font-size: 12px;
  color: var(--td-brand-color);
}

.title {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.4;
}

.summary {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
