<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import DemandReviewDialog from '@/components/DemandReviewDialog.vue'
import { fetchDemands } from '@/api/demands'
import type { Demand } from '@/types'

/* 需求审核：固定筛选「待审核」状态的需求集中审核。
 * 审核为只读：通过 → 转入「待发布」；驳回需填写原因；取消不做任何动作 */
const router = useRouter()
const loading = ref(true)
const list = ref<Demand[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  category: '',
  status: 'pending',
})

/* 排序：默认创建时间倒序（最新提交在前），支持创建时间正/倒序 */
const sortBy = ref<'createdAt' | 'id'>('createdAt')
const sortOrder = ref<'ascend' | 'descend'>('descend')

const categoryOptions = [
  { label: '全部', value: '' },
  ...['供应链', '设计', '法务财务', '技术开发', '市场', '人力资源'].map((label) => ({ label, value: label })),
]

const columns = [
  { colKey: 'title', title: '需求', cell: 'title', width: 210, resizable: true },
  { colKey: 'category', title: '类别', cell: 'category', width: 95, resizable: true },
  { colKey: 'publisher', title: '发布方', cell: 'publisher', width: 200, resizable: true },
  { colKey: 'budget', title: '预算', width: 125, resizable: true },
  {
    colKey: 'createdAt',
    title: '创建时间',
    width: 150,
    resizable: true,
    sorter: true,
    sortType: 'all',
  },
  { colKey: 'op', title: '操作', cell: 'op', width: 160 },
]

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

async function load() {
  loading.value = true
  try {
    const res = await fetchDemands({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'createdAt') return
  sortBy.value = 'createdAt'
  sortOrder.value = sort.descending ? 'descend' : 'ascend'
  query.page = 1
  load()
}

const tableSort = computed(() => ({
  sortBy: sortBy.value,
  descending: sortOrder.value === 'descend',
}))

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.category = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function goDetail(row: Demand) {
  router.push(`/demands/${row.id}`)
}

/* 只读审核对话框（通过 = 转待发布；驳回需填原因） */
const reviewVisible = ref(false)
const current = ref<Demand | null>(null)

function openReview(row: Demand) {
  current.value = row
  reviewVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="demand-review page-fade-in">
    <PageHeader title="需求审核" description="集中处理需求广场提交的待审核需求：只读审核，通过后转入「待发布」或驳回" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索标题/编号"
        clearable
        @enter="onSearch"
      />
      <t-select
        v-model="query.category"
        label="类别"
        :options="categoryOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-button theme="primary" variant="outline" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">
        <template #icon><RefreshIcon /></template>
        重置
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
        empty="暂无待审核的需求"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #title="{ row }">
          <div class="demand-cell">
            <span class="demand-title">{{ row.title }}</span>
            <span class="demand-id">{{ row.id }}</span>
          </div>
        </template>

        <template #category="{ row }">
          <t-tag variant="light">{{ row.category }}</t-tag>
        </template>

        <template #publisher="{ row }">
          <div class="publisher-cell">
            <span class="publisher-name">{{ row.publisherName }}</span>
            <IdentityTags :identities="row.publisherIdentity ? [row.publisherIdentity] : []" />
          </div>
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" theme="primary" @click="openReview(row)">审核</t-button>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 只读审核对话框 -->
    <DemandReviewDialog v-model:visible="reviewVisible" :demand="current" @success="load" />
  </div>
</template>

<style scoped>
.filter-keyword {
  width: 220px;
}

.demand-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.demand-title {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demand-id {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.publisher-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.publisher-name {
  font-size: 14px;
  line-height: 20px;
  color: var(--td-text-color-primary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}
</style>