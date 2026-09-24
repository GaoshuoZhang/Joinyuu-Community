<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, ref } from 'vue'
import StatCard from '@/components/StatCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchArticles } from '@/api/contents'
import type { Article } from '@/types'

/* 阅读统计面板：已发布（含已下架）文章的阅读数据汇总与排行；数据与文章列表同源 */
const loading = ref(false)
const loadError = ref('')
const list = ref<Article[]>([])

const published = computed(() => list.value.filter((a) => a.publishedAt))
const totalViews = computed(() => published.value.reduce((s, a) => s + a.views, 0))
const avgViews = computed(() => (published.value.length === 0 ? 0 : Math.round(totalViews.value / published.value.length)))
const topViews = computed(() => (published.value.length === 0 ? 0 : Math.max(...published.value.map((a) => a.views))))

/* 按阅读量倒序排行 */
const ranked = computed(() => [...list.value].sort((a, b) => b.views - a.views))

/* 前端分页：全量数据交由 t-table 内置分页本地切片（每页 20） */
const page = ref(1)
const pagination = computed(() => ({
  current: page.value,
  pageSize: 20,
  total: ranked.value.length,
  showPageSize: false,
}))

function onPageChange(p: { current: number }) {
  page.value = p.current
}

const columns = [
  { colKey: 'rank', title: '排名', cell: 'rank', width: 80 , ellipsis: true},
  { colKey: 'title', title: '文章', cell: 'title', width: 260, resizable: true , ellipsis: true},
  { colKey: 'columnNames', title: '栏目', cell: 'columnNames', width: 120, resizable: true , ellipsis: true},
  { colKey: 'authorName', title: '作者', width: 120, resizable: true , ellipsis: true},
  { colKey: 'views', title: '阅读量', cell: 'views', width: 100, resizable: true , ellipsis: true},
  { colKey: 'publishedAt', title: '发布时间', cell: 'publishedAt', width: 170, resizable: true , ellipsis: true},
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(columns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(columns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

/* 仅统计已发布文章（后端 pageSize 上限 100），逐页拉取后本地聚合；
 * 上限 50 页（5000 条）防止异常大的总量拖垮页面 */
const PAGE_SIZE = 100
const MAX_PAGES = 50

async function load() {
  loading.value = true
  try {
    const query = (page: number) => ({
      page,
      pageSize: PAGE_SIZE,
      status: 'published' as const,
      sortBy: 'views' as const,
      sortOrder: 'descend' as const,
    })
    const first = await fetchArticles(query(1))
    const all = [...first.list]
    const pages = Math.min(Math.ceil(first.total / PAGE_SIZE), MAX_PAGES)
    for (let p = 2; p <= pages; p++) {
      const res = await fetchArticles(query(p))
      all.push(...res.list)
    }
    list.value = all
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="read-stats-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="阅读统计" description="文章阅读量汇总与排行">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="read-stats"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </template>
    </PageHeader>
    <div v-if="!loadError" class="stat-row stat-row--4">
      <StatCard label="总阅读量" :value="totalViews" :loading="loading" />
      <StatCard label="已发布文章" :value="published.length" :loading="loading" />
      <StatCard label="篇均阅读" :value="avgViews" :loading="loading" />
      <StatCard label="单篇最高" :value="topViews" :loading="loading" />
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="ranked"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无文章"
        @page-change="onPageChange"
      >
        <template #rank="{ row }">
          <span :class="['rank-badge', { 'is-top': ranked.indexOf(row) < 3 }]">
            {{ ranked.indexOf(row) + 1 }}
          </span>
        </template>
        <template #title="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #columnNames="{ row }">
          <div class="col-tags">
            <template v-if="row.columnNames?.length">
              <t-tag v-for="c in row.columnNames" :key="c" variant="light" size="small">{{ c }}</t-tag>
            </template>
            <span v-else class="muted-dash">—</span>
          </div>
        </template>
        <template #authorName="{ row }">
          <span>{{ row.authorName || '—' }}<t-tag v-if="row.authorId" class="id-tag" size="small" variant="light">{{ row.authorId }}</t-tag></span>
        </template>
        <template #views="{ row }">
          <span class="views-num">{{ row.views }}</span>
        </template>
        <template #publishedAt="{ row }">
          {{ row.publishedAt || '—' }}
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
/* 名次徽标：两位名次宽度会超过高度，圆角须用固定 token，
 * 用 50% 会被撑成椭圆（圆形只适用于等宽高元素） */
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border-radius: var(--td-radius-default);
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-secondarycontainer);
}

.rank-badge.is-top {
  color: var(--td-text-color-anti);
  background: var(--td-brand-color);
  font-weight: 600;
}

.col-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}

.views-num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
</style>
