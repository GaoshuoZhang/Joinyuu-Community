<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchExternalEnterprises } from '@/api/external-enterprises'
import type { ExternalEnterprise } from '@/types'

const router = useRouter()
const loading = ref(true)
const list = ref<ExternalEnterprise[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  industry: '',
})

/* 行业选项（与 mock 档案行业保持一致） */
const industryOptions = [
  { label: '全部', value: '' },
  ...['风险投资', '财务咨询', '文化传播', '文化创意'].map((label) => ({ label, value: label })),
]

/* 排序：默认累计合作倒序（合作最多在前），支持累计合作/首次合作正倒序 */
const sortBy = ref<'cooperationCount' | 'firstCooperationAt'>('cooperationCount')
const sortOrder = ref<'ascend' | 'descend'>('descend')

const columns = [
  { colKey: 'name', title: '企业名称', cell: 'name', width: 220 },
  { colKey: 'industry', title: '行业', width: 120 },
  {
    colKey: 'cooperationCount',
    title: '累计合作',
    width: 95,
    sorter: true,
    sortType: 'all',
  },
  {
    colKey: 'firstCooperationAt',
    title: '首次合作',
    width: 110,
    sorter: true,
    sortType: 'all',
  },
  { colKey: 'memberCount', title: '关联成员', cell: 'memberCount', width: 95 },
  { colKey: 'op', title: '操作', cell: 'op', width: 90 },
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
    const res = await fetchExternalEnterprises({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'cooperationCount' && sort.sortBy !== 'firstCooperationAt') return
  sortBy.value = sort.sortBy
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
  query.industry = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function goDetail(row: ExternalEnterprise) {
  router.push(`/external-enterprises/${row.id}`)
}

onMounted(load)
</script>

<template>
  <div class="external-list page-fade-in">
    <PageHeader title="外部企业" description="由成员外部企业身份聚合的合作企业（未入驻社区，无展示页）" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索企业ID/名称/行业"
        clearable
        @enter="onSearch"
      />
      <t-select
        v-model="query.industry"
        label="行业"
        :options="industryOptions"
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
        table-layout="auto"
        hover
        resizable
        :data="list"
        :columns="columns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
        empty="暂无符合条件的外部企业"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="name-cell">
            <t-avatar size="36px">{{ row.name.slice(0, 1) }}</t-avatar>
            <span class="name-text">{{ row.name }}</span>
          </div>
        </template>

        <template #cooperationCount="{ row }">{{ row.cooperationCount }} 次</template>

        <template #memberCount="{ row }">
          <t-tag variant="light" size="small">{{ row.members.length }} 人</t-tag>
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.filter-keyword {
  width: 240px;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.name-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>