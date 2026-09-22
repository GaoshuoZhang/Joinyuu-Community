<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { AddIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import ColumnController from '@/components/ColumnController.vue'
import StatusTag from '@/components/StatusTag.vue'
import ExternalEnterpriseFormDialog from '@/components/ExternalEnterpriseFormDialog.vue'
import { fetchExternalEnterprises } from '@/api/external-enterprises'
import ListErrorState from '@/components/ListErrorState.vue'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import type { ExternalEnterprise } from '@/types'

const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<ExternalEnterprise[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  industry: '',
  status: '',
})

/* 行业选项来自数据字典（与社区企业共用 industry 字典），加载失败回退默认词表 */
const industryOptions = ref([
  { label: '全部', value: '' },
  ...dictFallback.industry.map((label) => ({ label, value: label })),
])

const statusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '已停用', value: 'disabled' },
]

/* 排序：默认登记日期倒序（最新登记在前），支持登记日期正倒序 */
const sortBy = ref<'registeredAt'>('registeredAt')
const sortOrder = ref<'ascend' | 'descend'>('descend')

const columns = [
  { colKey: 'name', title: '企业名称', cell: 'name', width: 230 , ellipsis: true},
  { colKey: 'industry', title: '行业', width: 120 , ellipsis: true},
  {
    colKey: 'registeredAt',
    title: '登记日期',
    width: 110,
    sorter: true,
    sortType: 'all',
  ellipsis: true,
  },
  { colKey: 'memberCount', title: '关联成员', cell: 'memberCount', width: 95 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 90 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 90 },
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

/* 请求序号守卫：仅最后一次请求可写回状态，避免快速切页/改筛选时的竞态覆盖 */
let version = 0
async function load() {
  const current = ++version
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchExternalEnterprises({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    if (current === version) {
      list.value = res.list
      total.value = res.total
    }
  } catch (e) {
    if (current === version) loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (current === version) loading.value = false
  }
}

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'registeredAt') return
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
  query.status = ''
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

/* 新增合作企业弹窗 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const current = ref<ExternalEnterprise | null>(null)

function openCreate() {
  formMode.value = 'create'
  current.value = null
  formVisible.value = true
}

/* 导出配置 */
const exportHeaders = ['编号', '企业名称', '行业', '登记日期', '关联成员数']

function mapRow(e: ExternalEnterprise): (string | number)[] {
  return [e.id, `${e.name} [${e.id}]`, e.industry, e.registeredAt, e.members.length]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchExternalEnterprises({ ...query, page, pageSize })
}

const { syncQuery } = useListQueryState(query, load, { refs: { sortBy, sortOrder } })

onMounted(() => {
  load()
  fetchDictEntries('industry')
    .then((entries) => {
      const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
      if (labels.length) industryOptions.value = [{ label: '全部', value: '' }, ...labels]
    })
    .catch(() => {
      /* 字典加载失败保留回退词表 */
    })
})
</script>

<template>
  <div class="external-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <PageHeader title="合作企业" description="由成员合作企业身份聚合的合作企业（未入驻社区，无展示页）">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="external-enterprises"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <ExportButton
          filename="合作企业列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button theme="primary" v-permission="'perm:external-enterprise:create'" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增合作企业
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="ctl-w-xl"
        placeholder="搜索企业ID/名称/行业…"
        clearable
        @enter="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.industry"
        label="行业"
        :options="industryOptions"
        clearable
        @change="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        @change="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
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
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        @row-click="({ row }: { row: ExternalEnterprise }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="name-cell">
            <t-avatar size="36px">{{ row.name.slice(0, 1) }}</t-avatar>
            <div class="name-meta">
              <span class="name-text">{{ row.name }}</span>
              <t-tag class="id-tag-block" size="small" variant="light">{{ row.id }}</t-tag>
            </div>
          </div>
        </template>

        <template #memberCount="{ row }">
          <t-tag variant="light" size="small">{{ row.members.length }} 人</t-tag>
        </template>

        <template #status="{ row }">
          <StatusTag entity="enterprise" :value="row.status" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无合作企业" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <ExternalEnterpriseFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :enterprise="current"
      @success="load"
    />
  </div>
</template>

<style scoped>
.name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.name-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
