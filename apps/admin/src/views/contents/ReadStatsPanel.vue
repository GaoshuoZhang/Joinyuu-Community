<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import StatCard from '@/components/StatCard.vue'
import { fetchArticles } from '@/api/contents'
import type { Article } from '@/types'

/* 阅读统计面板：已发布（含已下架）文章的阅读数据汇总与排行；数据与文章列表同源 */
const loading = ref(false)
const list = ref<Article[]>([])

const published = computed(() => list.value.filter((a) => a.publishedAt))
const totalViews = computed(() => published.value.reduce((s, a) => s + a.views, 0))
const avgViews = computed(() => (published.value.length === 0 ? 0 : Math.round(totalViews.value / published.value.length)))
const topViews = computed(() => (published.value.length === 0 ? 0 : Math.max(...published.value.map((a) => a.views))))

/* 按阅读量倒序排行 */
const ranked = computed(() => [...list.value].sort((a, b) => b.views - a.views))

const columns = [
  { colKey: 'rank', title: '排名', cell: 'rank', width: 80 },
  { colKey: 'title', title: '文章', cell: 'title', minWidth: 260, resizable: true },
  { colKey: 'columnName', title: '栏目', width: 110, resizable: true },
  { colKey: 'authorName', title: '作者', width: 120, resizable: true },
  { colKey: 'views', title: '阅读量', cell: 'views', width: 100, resizable: true },
  { colKey: 'publishedAt', title: '发布时间', cell: 'publishedAt', width: 160, resizable: true },
]

async function load() {
  loading.value = true
  try {
    const res = await fetchArticles({ page: 1, pageSize: 999, sortBy: 'views', sortOrder: 'descend' })
    list.value = res.list
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="read-stats-panel">
    <div class="stat-row">
      <StatCard label="总阅读量" :value="totalViews" />
      <StatCard label="已发布文章" :value="published.length" />
      <StatCard label="篇均阅读" :value="avgViews" />
      <StatCard label="单篇最高" :value="topViews" />
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="ranked"
        :columns="columns"
        :loading="loading"
        empty="暂无文章数据"
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
        <template #views="{ row }">
          <span class="views-num">{{ row.views }}</span>
        </template>
        <template #publishedAt="{ row }">
          {{ row.publishedAt ?? '未发布' }}
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-secondarycontainer);
}

.rank-badge.is-top {
  color: #fff;
  background: var(--td-brand-color);
  font-weight: 600;
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.views-num {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
</style>
