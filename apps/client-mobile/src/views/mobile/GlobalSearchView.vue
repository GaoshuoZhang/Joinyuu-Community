<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, CheckTag, Icon, Loading, Search, Tag } from 'tdesign-mobile-vue'
import { fetchArticles } from '@/api/contents'
import { fetchEnterpriseList, fetchPolicies, fetchTalents } from '@/api/community'
import { fetchDemands } from '@/api/demands'
import { fetchEvents } from '@/api/events'
import { fetchSpaces } from '@/api/spaces'
import { trackEvent } from '@/api/analytics'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

useAnimSuppress()

type SearchResult = { id: string; kind: string; title: string; summary: string; path: string }

const RECENT_KEY = 'joinyuu_recent_searches'
const route = useRoute()
const router = useRouter()
const keyword = ref(String(route.query.q ?? ''))
const loading = ref(false)
const error = ref('')
const partialError = ref('')
const results = ref<SearchResult[]>([])

const hasKeyword = computed(() => Boolean(keyword.value.trim()))
const counts = computed(() => {
  const map: Record<string, number> = {}
  for (const item of results.value) map[item.kind] = (map[item.kind] ?? 0) + 1
  return map
})
const categoryOrder = computed(() => Object.keys(counts.value))
/* v40：分类 chips 可点击过滤 */
const activeKind = ref('')
const visibleResults = computed(() => (activeKind.value ? results.value.filter((item) => item.kind === activeKind.value) : results.value))
const demandHasResults = ref(false)

const recent = ref<string[]>(loadRecent())
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}
function recordRecent(q: string) {
  const next = [q, ...recent.value.filter((item) => item !== q)].slice(0, 8)
  recent.value = next
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* 隐私模式下忽略 */
  }
}
function clearRecent() {
  recent.value = []
  localStorage.removeItem(RECENT_KEY)
}
function useRecent(q: string) {
  keyword.value = q
  void search()
}

let searchId = 0

async function search() {
  const q = keyword.value.trim()
  if (!q) {
    searchId += 1
    results.value = []
    error.value = ''
    partialError.value = ''
    loading.value = false
    return
  }
  const id = ++searchId
  loading.value = true
  error.value = ''
  partialError.value = ''
  try {
    /* v36：单一数据源失败不影响其余结果（部分失败提示） */
    const failed: string[] = []
    const [demandRes, events, articles, policies, talents, enterprises, spaces] = await Promise.all([
      fetchDemands({ keyword: q, page: 1, pageSize: 10 }).catch(() => { failed.push('项目'); return null }),
      fetchEvents({ keyword: q }).catch(() => { failed.push('活动'); return null }),
      fetchArticles({ keyword: q }).catch(() => { failed.push('文章'); return [] }),
      fetchPolicies({ keyword: q }).catch(() => { failed.push('社区服务'); return [] }),
      fetchTalents({ keyword: q }).catch(() => { failed.push('人才'); return [] }),
      fetchEnterpriseList({ keyword: q }).catch(() => { failed.push('企业'); return [] }),
      fetchSpaces().catch(() => { failed.push('空间'); return [] }),
    ])
    /* v38：旧请求不覆盖新关键词结果 */
    if (id !== searchId) return
    activeKind.value = ''
    demandHasResults.value = (demandRes?.list.length ?? 0) > 0
    results.value = [
      ...(demandRes?.list ?? []).map((item) => ({ id: item.id, kind: '项目', title: item.title, summary: item.description, path: `/demands/${item.id}` })),
      ...(events?.list ?? []).map((item) => ({ id: item.id, kind: '活动', title: item.title, summary: `${formatLocalDateTime(item.startTime)} · ${item.location}`, path: `/events/${item.id}` })),
      ...articles.map((item) => ({ id: item.id, kind: '文章', title: item.title, summary: item.summary, path: `/articles/${item.id}` })),
      ...policies.map((item) => ({ id: item.id, kind: '社区服务', title: item.title, summary: item.summary, path: `/community?tab=service&policy=${item.id}` })),
      ...talents.map((item) => ({ id: item.uid, kind: '人才', title: item.name, summary: `${item.role} · ${item.intro}`, path: `/talents/${item.uid}` })),
      ...enterprises
        .map((item) => ({ id: item.id, kind: '企业', title: item.name, summary: `${item.industry} · ${item.description}`, path: `/enterprises/${item.id}` })),
      ...spaces
        .filter((item) => item.name.includes(q) || item.location.includes(q))
        .map((item) => ({ id: item.id, kind: '空间', title: item.name, summary: `${item.location} · 可容纳 ${formatZhNumber(item.capacity)} 人`, path: `/spaces/${item.id}/reserve` })),
    ]
    if (failed.length) partialError.value = `${failed.join('、')}暂时无法加载，已展示其余结果`
    recordRecent(q)
    void trackEvent('search')
    /* v38：关键词同步到 URL，返回/分享可还原上下文（页面已 KeepAlive，不会因 query 变化重建） */
    if (route.query.q !== q) void router.replace({ query: { ...route.query, q } })
  } catch (e) {
    if (id !== searchId) return
    error.value = e instanceof Error ? e.message : '搜索失败，请稍后重试'
  } finally {
    if (id === searchId) loading.value = false
  }
}

let searchTimer: number | undefined
watch(keyword, () => {
  window.clearTimeout(searchTimer)
  searchId += 1
  /* 清空仅重置本地结果，不更新路由 */
  if (!keyword.value.trim()) {
    searchId += 1
    loading.value = false
    results.value = []
    error.value = ''
    partialError.value = ''
    return
  }
  /* 防抖等待也属于搜索过程，避免先闪现空结果再显示命中内容。 */
  loading.value = true
  error.value = ''
  searchTimer = window.setTimeout(() => void search(), 300)
})

/* 回车/点击搜索：取消防抖，立即执行同一次搜索（避免重复请求） */
function onSearchNow() {
  window.clearTimeout(searchTimer)
  void search()
}

onBeforeUnmount(() => window.clearTimeout(searchTimer))

useRouteQuerySync('/search', (query) => {
  const nextKeyword = query.q ?? ''
  if (nextKeyword === keyword.value) return
  window.clearTimeout(searchTimer)
  keyword.value = nextKeyword
})

onMounted(() => {
  void search()
})
</script>

<template>
  <div class="page-fade-in global-search">
    <header class="head">
      <p class="page-desc">查找项目、活动、文章、社区服务和人才</p>
    </header>
    <Search v-model="keyword" placeholder="输入关键词后搜索…" @search="onSearchNow" />

    <!-- v46：仅首次搜索（还没有结果）用骨架屏；续搜保留旧结果，只在结果区上方给局部加载指示，
         避免每次输入都切回骨架导致结果区闪烁 -->
    <ListSkeleton v-if="loading && !results.length" :rows="2" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="onSearchNow" />
    <template v-else-if="hasKeyword">
      <p v-if="partialError" class="partial-error">{{ partialError }}</p>
      <Loading v-if="loading" class="search-loading" text="搜索中…" />
      <div v-if="categoryOrder.length" class="count-chips">
        <CheckTag
          size="medium"
          variant="light"
          :checked="activeKind === ''"
          @change="activeKind = ''"
        >
          全部 {{ formatZhNumber(results.length) }}
        </CheckTag>
        <CheckTag
          v-for="c in categoryOrder"
          :key="c"
          size="medium"
          variant="light"
          :checked="activeKind === c"
          @change="activeKind = activeKind === c ? '' : c"
        >
          {{ c }} {{ formatZhNumber(counts[c] ?? 0) }}
        </CheckTag>
      </div>
      <Button v-if="demandHasResults" size="small" variant="outline" block @click="router.push(`/projects?q=${encodeURIComponent(keyword.trim())}`)">
        查看更多项目
        <template #suffix><Icon aria-hidden="true" name="chevron-right" size="14px" /></template>
      </Button>
      <EmptyBlock v-if="!visibleResults.length" text="没有找到相关内容，换个关键词试试" />
      <div v-else class="result-list stagger">
        <router-link v-for="item in visibleResults" :key="`${item.kind}-${item.id}`" class="m-card result pressable" :to="item.path">
          <div class="result-head"><Tag size="small" variant="light">{{ item.kind }}</Tag><h2>{{ item.title }}</h2></div>
          <p>{{ item.summary }}</p>
        </router-link>
      </div>
    </template>
    <template v-else>
      <div v-if="recent.length" class="recent">
        <div class="recent-head">
          <span>最近搜索</span>
          <Button size="small" variant="text" theme="default" @click="clearRecent">清空</Button>
        </div>
        <div class="recent-chips">
          <CheckTag v-for="r in recent" :key="r" size="medium" variant="light" :checked="false" @change="useRecent(r)">{{ r }}</CheckTag>
        </div>
      </div>
      <div v-else class="search-guide">输入关键词，搜索社区内的公开内容</div>
    </template>
  </div>
</template>

<style scoped>
.global-search { display: flex; flex-direction: column; gap:var(--app-space-6); padding:var(--app-space-8); }
.head { padding:0 var(--app-space-1); }
.head .page-desc { margin:0; font-size: var(--app-font-caption); color: var(--td-text-color-secondary); }
.state { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 120px; padding:var(--app-space-12) 0; }
.result-list { display: flex; flex-direction: column; gap:var(--app-space-5); }
.result { color: inherit; text-decoration: none; cursor: pointer; }
.result-head { display: flex; align-items: center; gap:var(--app-space-4); }
.result h2 { overflow: hidden; margin:0; font-size: var(--app-font-subtitle); text-overflow: ellipsis; white-space: nowrap; }
.result p { display: -webkit-box; overflow: hidden; margin:var(--app-space-4) 0 0; color: var(--td-text-color-secondary); font-size: var(--app-font-caption); line-height: 1.7; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.search-guide { padding:var(--app-space-12) 0; color: var(--td-text-color-placeholder); font-size: var(--app-font-body); text-align: center; }
.partial-error { margin:0; padding:var(--app-space-4) var(--app-space-5); border-radius: var(--td-radius-default); background: var(--td-warning-color-1); color: var(--td-text-color-secondary); font-size: var(--app-font-caption); }
/* v46：续搜时的局部加载指示（结果区保留可见） */
.search-loading { padding:var(--app-space-4) 0; }
.count-chips { display: flex; flex-wrap: wrap; gap:var(--app-space-3); }
.recent { display: flex; flex-direction: column; gap:var(--app-space-4); }
.recent-head { display: flex; align-items: center; justify-content: space-between; font-size: var(--app-font-caption); color: var(--td-text-color-secondary); }
.recent-head :deep(.t-button) { color: var(--td-brand-color); }
.recent-chips { display: flex; flex-wrap: wrap; gap:var(--app-space-4); }
</style>
