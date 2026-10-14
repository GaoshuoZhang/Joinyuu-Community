<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import DemandReviewDialog from '@/components/DemandReviewDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchDemands } from '@/api/demands'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { identityLabelOf } from '@/constants/identity'
import type { Demand } from '@/types'

/* 需求审核：固定筛选「待审核」状态的需求集中审核。
 * 审核为只读：通过 → 转入「待发布」；驳回需填写原因；取消不做任何动作 */
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
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

/* 类别选项来自数据字典，加载失败回退默认词表 */
const categoryOptions = ref([
  { label: '全部', value: '' },
  ...dictFallback.demand_category.map((label) => ({ label, value: label })),
])
const categoryText = (demand: Demand) => demand.categoryLabel ?? demand.category

const columns = [
  { colKey: 'title', title: '需求', cell: 'title', width: 210, resizable: true , ellipsis: true},
  { colKey: 'category', title: '类别', cell: 'category', width: 95, resizable: true , ellipsis: true},
  { colKey: 'publisher', title: '提交人', cell: 'publisher', width: 200, resizable: true , ellipsis: true},
  { colKey: 'budget', title: '预算', width: 125, resizable: true , ellipsis: true},
  {
    colKey: 'createdAt',
    title: '创建时间',
    width: 170,
    resizable: true,
    sorter: true,
    sortType: 'all',
  ellipsis: true,
  },
  { colKey: 'op', title: '操作', cell: 'op', width: 200 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(columns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(columns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

async function load() {
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchDemands({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
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

/* 提交人身份快照 → 标签文字（社区官方显示工作人员角色名；企业仅显示 社区企业/合作企业，不追加成员标题） */
function publisherIdentityLabel(row: Demand): string {
  return identityLabelOf(row.publisherIdentity)
}

/* 身份标签主题：与需求列表口径一致（社区身份 primary，其余 default） */
function publisherIdentityTheme(row: Demand): 'default' | 'primary' {
  const t = row.publisherIdentity?.type
  return t === 'official' || t === 'community_enterprise' || t === 'community_individual' ? 'primary' : 'default'
}

/* 只读审核对话框（通过 = 转待发布；驳回需填原因） */
const reviewVisible = ref(false)
const current = ref<Demand | null>(null)

function openReview(row: Demand) {
  current.value = row
  reviewVisible.value = true
}

const { syncQuery } = useListQueryState(query, load, { refs: { sortBy, sortOrder } })

onMounted(() => {
  load()
  fetchDictEntries('demand_category')
    .then((entries) => {
      const options = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.code }))
      if (options.length) categoryOptions.value = [{ label: '全部', value: '' }, ...options]
    })
    .catch(() => {
      /* 字典加载失败保留回退词表 */
    })
})
</script>

<template>
  <div class="demand-review page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="需求审核" description="集中处理需求广场提交的待审核需求：只读审核，通过后转入「待发布」或驳回">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="demand-review"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="ctl-w-xl"
        placeholder="搜索标题/编号…"
        clearable
        @enter="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.category"
        label="类别"
        :options="categoryOptions"
        clearable
        @change="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">
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
        :columns="visibleColumns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @row-click="({ row }: { row: Demand }) => goDetail(row)"
      >
        <template #title="{ row }">
          <div class="demand-cell">
            <span class="demand-title">{{ row.title }}</span>
            <span class="demand-id">{{ row.id }}</span>
          </div>
        </template>

        <template #category="{ row }">
          <t-tag variant="light">{{ categoryText(row) }}</t-tag>
        </template>

        <template #publisher="{ row }">
          <div class="publisher-cell">
            <span class="publisher-name">{{ row.publisherName }}</span>
            <div class="tag-row">
              <t-tag v-if="row.publisherId" size="small" variant="light">{{ row.publisherId }}</t-tag>
              <t-tag size="small" :theme="publisherIdentityTheme(row)" variant="light">{{ publisherIdentityLabel(row) }}</t-tag>
            </div>
          </div>
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
            <t-button variant="text" size="small" theme="primary" @click="openReview(row)">审核</t-button>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" :ignore="['status']" description="暂无待审核的需求" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 只读审核对话框 -->
    <DemandReviewDialog v-model:visible="reviewVisible" :demand="current" @success="load" />
  </div>
</template>

<style scoped>
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

.tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
