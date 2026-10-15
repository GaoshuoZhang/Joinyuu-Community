<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, ref } from 'vue'
import StatCard from '@/components/StatCard.vue'
import PageHeader from '@/components/PageHeader.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchArticleReadStats } from '@/api/contents'
import type { Article } from '@/types'

/* 阅读统计：服务端聚合全部已发布过且未归档的文章，含已下架文章；排行服务端分页。 */
const loading = ref(false)
const loadError = ref('')
const list = ref<Article[]>([])

const summary = ref({ totalViews: 0, articleCount: 0, averageViews: 0, topViews: 0 })
const total = ref(0)
const ranked = computed(() => list.value)

const page = ref(1)
const pagination = computed(() => ({
  current: page.value,
  pageSize: 20,
  total: total.value,
  showPageSize: false,
}))

function onPageChange(p: { current: number }) {
  page.value = p.current
  void load()
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

let version = 0
async function load() {
  const current = ++version
  loading.value = true
  try {
    const result = await fetchArticleReadStats(page.value, 20)
    if (current !== version) return
    list.value = result.list
    total.value = result.total
    summary.value = result.summary
    loadError.value = ''
  } catch (e) {
    if (current === version) loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (current === version) loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="read-stats-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="阅读统计" description="全部已发布过且未归档的文章阅读汇总（含已下架文章）">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="read-stats"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </template>
    </PageHeader>
    <div v-if="!loadError" class="stat-row stat-row--4">
      <StatCard label="总阅读量" :value="summary.totalViews" :loading="loading" />
      <StatCard label="已发布文章" :value="summary.articleCount" :loading="loading" />
      <StatCard label="篇均阅读" :value="summary.averageViews" :loading="loading" />
      <StatCard label="单篇最高" :value="summary.topViews" :loading="loading" />
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :disable-data-page="true"
        :data="ranked"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无文章"
        @page-change="onPageChange"
      >
        <template #rank="{ row }">
          <span :class="['rank-badge', { 'is-top': (page - 1) * 20 + ranked.indexOf(row) < 3 }]">
            {{ (page - 1) * 20 + ranked.indexOf(row) + 1 }}
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
