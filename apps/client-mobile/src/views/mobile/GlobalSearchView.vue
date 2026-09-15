<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Search, Tag } from 'tdesign-mobile-vue'
import { fetchArticles } from '@/api/contents'
import { fetchPolicies, fetchTalents } from '@/api/community'
import { fetchDemands } from '@/api/demands'
import { fetchEvents } from '@/api/events'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

type SearchResult = { id: string; kind: string; title: string; summary: string; path: string }

const route = useRoute()
const router = useRouter()
const keyword = ref(String(route.query.q ?? ''))
const loading = ref(false)
const error = ref('')
const results = ref<SearchResult[]>([])
const searchHost = ref<HTMLElement | null>(null)

const hasKeyword = computed(() => Boolean(keyword.value.trim()))

async function search() {
  const q = keyword.value.trim()
  if (!q) {
    results.value = []
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const [demands, events, articles, policies, talents] = await Promise.all([
      fetchDemands({ keyword: q, page: 1, pageSize: 10 }),
      fetchEvents({ keyword: q }),
      fetchArticles({ keyword: q }),
      fetchPolicies({ keyword: q }),
      fetchTalents({ keyword: q }),
    ])
    results.value = [
      ...demands.list.map((item) => ({ id: item.id, kind: '项目', title: item.title, summary: item.description, path: `/demands/${item.id}` })),
      ...events.map((item) => ({ id: item.id, kind: '活动', title: item.title, summary: `${item.startTime} · ${item.location}`, path: `/events/${item.id}` })),
      ...articles.map((item) => ({ id: item.id, kind: '文章', title: item.title, summary: item.summary, path: `/articles/${item.id}` })),
      ...policies.map((item) => ({ id: item.id, kind: '社区服务', title: item.title, summary: item.summary, path: `/community?tab=service&policy=${item.id}` })),
      ...talents.map((item) => ({ id: item.uid, kind: '人才', title: item.name, summary: `${item.role} · ${item.intro}`, path: `/talents/${item.uid}` })),
    ]
  } catch (e) {
    error.value = e instanceof Error ? e.message : '搜索失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function go(item: SearchResult) {
  void router.push(item.path)
}

let searchTimer: number | undefined
watch(keyword, () => {
  window.clearTimeout(searchTimer)
  /* 清空仅重置本地结果，不更新路由，避免 AppShell 按 fullPath 触发页面过渡。 */
  if (!keyword.value.trim()) {
    loading.value = false
    results.value = []
    error.value = ''
    return
  }
  /* 防抖等待也属于搜索过程，避免先闪现空结果再显示命中内容。 */
  loading.value = true
  error.value = ''
  searchTimer = window.setTimeout(() => void search(), 300)
})

onBeforeUnmount(() => window.clearTimeout(searchTimer))

onMounted(async () => {
  await nextTick()
  searchHost.value?.querySelector<HTMLInputElement>('input')?.focus()
  void search()
})
</script>

<template>
  <div class="page-fade-in global-search">
    <header class="head">
      <h1 class="page-title">全局搜索</h1>
      <p class="page-desc">查找项目、活动、文章、社区服务和人才</p>
    </header>
    <div ref="searchHost"><Search v-model="keyword" placeholder="输入关键词后搜索" @search="search" /></div>

    <Loading v-if="loading" class="state" text="搜索中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="hasKeyword && !results.length" text="没有找到相关内容，换个关键词试试" />
    <div v-else-if="results.length" class="result-list stagger">
      <article v-for="item in results" :key="`${item.kind}-${item.id}`" class="m-card result pressable" @click="go(item)">
        <div class="result-head"><Tag size="small" variant="light">{{ item.kind }}</Tag><h2>{{ item.title }}</h2></div>
        <p>{{ item.summary }}</p>
      </article>
    </div>
    <div v-else class="search-guide">输入关键词，搜索社区内的公开内容</div>
  </div>
</template>

<style scoped>
.global-search { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.head { padding: 0 2px; }
.head .page-title { margin: 0 0 4px; font-size: 20px; }
.head .page-desc { margin: 0; font-size: 12px; color: var(--td-text-color-secondary); }
.state { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 120px; padding: 32px 0; }
.result-list { display: flex; flex-direction: column; gap: 10px; }
.result { cursor: pointer; }
.result-head { display: flex; align-items: center; gap: 8px; }
.result h2 { overflow: hidden; margin: 0; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.result p { display: -webkit-box; overflow: hidden; margin: 8px 0 0; color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.7; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.search-guide { padding: 32px 0; color: var(--td-text-color-placeholder); font-size: 13px; text-align: center; }
</style>
