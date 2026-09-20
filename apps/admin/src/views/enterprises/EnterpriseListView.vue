<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { AddIcon, SearchIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import EnterpriseFormDialog from '@/components/EnterpriseFormDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchEnterprises } from '@/api/enterprises'
import ListErrorState from '@/components/ListErrorState.vue'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { exportCsv, statusLabel } from '@/utils/exportCsv'
import type { Enterprise } from '@/types'

const router = useRouter()
const loading = ref(false)
const loadError = ref('')
const list = ref<Enterprise[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  industry: '',
  status: '',
})

/* 行业选项来自数据字典，加载失败回退默认词表 */
const industryOptions = ref([
  { label: '全部', value: '' },
  ...dictFallback.industry.map((label) => ({ label, value: label })),
])

const statusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '已退出', value: 'exited' },
  { label: '已停用', value: 'disabled' },
]

const columns = [
  { colKey: 'name', title: '企业', cell: 'name', width: 230 , ellipsis: true},
  { colKey: 'industry', title: '行业', width: 130 , ellipsis: true},
  { colKey: 'size', title: '规模', width: 110 , ellipsis: true},
  { colKey: 'leaseType', title: '入驻类型', width: 120 , ellipsis: true},
  { colKey: 'level', title: '企业等级', width: 130, cell: 'level' , ellipsis: true},
  { colKey: 'settledAt', title: '入驻时间', width: 120, cell: 'settledAt' , ellipsis: true},
  { colKey: 'status', title: '状态', width: 100, cell: 'status' , ellipsis: true},
  { colKey: 'op', title: '操作', width: 80, cell: 'op' },
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
    const res = await fetchEnterprises({ ...query })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.industry = ''
  query.status = ''
  onSearch()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function goDetail(row: Enterprise) {
  router.push(`/enterprises/${row.id}`)
}

/* 新增企业弹窗 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')

function openCreate() {
  formMode.value = 'create'
  formVisible.value = true
}

/* 导出当前页社区企业列表为 CSV */
function onExport() {
  exportCsv(
    '社区企业列表',
    ['编号', '企业名称', '行业', '规模', '入驻类型', '企业等级', '企业状态', '入驻时间'],
    list.value.map((e) => [
      e.id,
      `${e.name} [${e.id}]`,
      e.industry,
      e.size,
      e.leaseType,
      e.level ? `Lv.${e.level}${e.levelName ? ` ${e.levelName}` : ''}` : '—',
      statusLabel('enterprise', e.status),
      e.settledAt ?? '—',
    ]),
  )
  MessagePlugin.success(`已导出当前页 ${list.value.length} 条数据`)
}

const { syncQuery } = useListQueryState(query, load)

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
  <div class="enterprise-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <PageHeader title="社区企业" description="入驻社区的企业信息、成员与展示页管理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="enterprises"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" @click="onExport">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
        <t-button theme="primary" v-permission="'perm:enterprise:create'" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增企业
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索企业名称/ID…"
        clearable
        style="width: 220px"
        @enter="onSearch"
      />
      <t-select
        v-model="query.industry"
        label="行业"
        :options="industryOptions"
        clearable
        style="width: 170px"
        @change="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-button theme="primary" @click="onSearch">
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
        :loading="loading"
        :pagination="pagination"
        empty="暂无企业"
        @page-change="onPageChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="ent-cell">
            <t-avatar class="ent-avatar" size="36px">{{ row.name.slice(0, 1) }}</t-avatar>
            <div class="ent-meta">
              <span class="ent-name">{{ row.name }}</span>
              <t-tag class="id-tag-block" size="small" variant="light">{{ row.id }}</t-tag>
            </div>
          </div>
        </template>
        <template #level="{ row }">
          <span v-if="row.level">Lv.{{ row.level }}<template v-if="row.levelName"> {{ row.levelName }}</template></span>
          <span v-else>—</span>
        </template>
        <template #settledAt="{ row }">{{ row.settledAt ?? '—' }}</template>
        
        <template #status="{ row }">
          <StatusTag entity="enterprise" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <EnterpriseFormDialog v-model:visible="formVisible" :mode="formMode" :enterprise="null" @success="load" />
  </div>
</template>

<style scoped>
.ent-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ent-avatar {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
  border-radius: var(--td-radius-medium);
}

.ent-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ent-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.t-table__row) {
  cursor: pointer;
}

.op-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
