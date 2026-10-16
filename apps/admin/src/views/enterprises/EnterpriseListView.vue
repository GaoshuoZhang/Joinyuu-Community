<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { AddIcon, ChevronDownIcon, SearchIcon, ViewListIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import EnterpriseFormDialog from '@/components/EnterpriseFormDialog.vue'
import DictEntriesDialog from '@/components/DictEntriesDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchEnterprises } from '@/api/enterprises'
import ListErrorState from '@/components/ListErrorState.vue'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { statusLabel } from '@/utils/exportCsv'
import type { Enterprise } from '@/types'

const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<Enterprise[]>([])
const total = ref(0)

/* 状态勾选式筛选（同活动管理）：3 个可选状态（不含「全部」项）；
 * 默认仅勾选「正常」，即列表默认不展示「已退出 / 已停用」；
 * 全部取消勾选 = 不按状态过滤（显示全部） */
const statusCheckOptions = [
  { label: '正常', value: 'active' },
  { label: '已退出', value: 'exited' },
  { label: '已停用', value: 'disabled' },
]
const DEFAULT_STATUSES = ['active']

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  industry: '',
  /* 勾选式状态筛选：数组（useListQueryState 以重复 query 参数同步）；空串占位 = 不按状态过滤 */
  status: [...DEFAULT_STATUSES] as string[],
})

/* 状态勾选面板（同活动管理）：勾选即查询；ESC 关闭（t-popup 仅 trigger=focus 内置 ESC 处理） */
const statusPanelVisible = ref(false)
const checkedStatusCount = computed(() => query.status.filter(Boolean).length)

function onStatusPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && statusPanelVisible.value) statusPanelVisible.value = false
}

/* 空选 = 不按状态过滤：用单元素空串占位 —— 空数组会被 vue-router 从 URL 中丢弃 */
function onStatusChange(value: (string | number)[]) {
  const picked = value.map(String).filter(Boolean)
  query.status = picked.length ? picked : ['']
  onSearch()
}

function selectAllStatuses() {
  query.status = statusCheckOptions.map((o) => o.value)
  onSearch()
}

function clearAllStatuses() {
  query.status = ['']
  onSearch()
}

/* 行业维护弹窗（原「数据字典 > 行业」入口；label 即业务存储值，故仅支持新增/启停/删除） */
const industryDialogVisible = ref(false)

/* 行业选项来自数据字典，加载失败回退默认词表 */
const industryOptions = ref([
  { label: '全部', value: '' },
  ...dictFallback.industry.map((label) => ({ label, value: label })),
])

const columns = [
  { colKey: 'name', fixed: 'left' as const, title: '企业', cell: 'name', width: 230 , ellipsis: true},
  { colKey: 'industry', title: '行业', width: 130 , ellipsis: true},
  { colKey: 'size', title: '规模', width: 110 , ellipsis: true},
  { colKey: 'leaseType', title: '入驻类型', width: 120 , ellipsis: true},
  { colKey: 'level', title: '企业等级', width: 130, cell: 'level' , ellipsis: true},
  { colKey: 'settledAt', title: '入驻时间', width: 170, cell: 'settledAt' , ellipsis: true},
  { colKey: 'status', title: '状态', width: 100, cell: 'status' , ellipsis: true},
  { colKey: 'op', fixed: 'right' as const, title: '操作', width: 90, cell: 'op' },
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
    const res = await fetchEnterprises({ ...query })
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

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.industry = ''
  query.status = [...DEFAULT_STATUSES]
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

/* 导出配置 */
const exportHeaders = ['编号', '企业名称', '行业', '规模', '入驻类型', '企业等级', '企业状态', '入驻时间']

function mapRow(e: Enterprise): (string | number)[] {
  return [
    e.id,
    `${e.name} [${e.id}]`,
    e.industry,
    e.size,
    e.leaseType,
    e.level ? `Lv.${e.level}${e.levelName ? ` ${e.levelName}` : ''}` : '—',
    statusLabel('enterprise', e.status),
    e.settledAt ?? '—',
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchEnterprises({ ...query, page, pageSize })
}

const { syncQuery } = useListQueryState(query, load)

onMounted(() => {
  window.addEventListener('keydown', onStatusPanelKeydown)
  load()
  void loadIndustries()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onStatusPanelKeydown))

/* 行业下拉（含「行业管理」弹窗保存后的刷新；原「数据字典 > 行业」入口迁移至此）：
 * 该页行业的 value 与存储值一致（均为 label），故 value 取 label */
async function loadIndustries() {
  try {
    const entries = await fetchDictEntries('industry')
    const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
    if (labels.length) industryOptions.value = [{ label: '全部', value: '' }, ...labels]
  } catch {
    /* 字典加载失败保留回退词表 */
  }
}
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
        <t-button variant="outline" @click="industryDialogVisible = true">
          <template #icon><ViewListIcon /></template>
          行业管理
        </t-button>
        <ExportButton
          filename="社区企业列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button theme="primary" v-permission="'perm:enterprise:create'" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增企业
        </t-button>
      </template>
    </PageHeader>

    <DictEntriesDialog v-model:visible="industryDialogVisible" type="industry" title="行业管理" entry-name="行业" @success="loadIndustries" />

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索企业名称/ID'" class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索企业名称/ID…"
        clearable
        @enter="onSearch"
      />
      <t-select v-accessible-field="'行业'" class="ctl-w-md"
        v-model="query.industry"
        label="行业"
        :options="industryOptions"
        clearable
        @change="onSearch"
      />
      <!-- 状态：勾选式多选（默认勾选「正常」，全部取消 = 不按状态过滤）；勾选即查询 -->
      <t-popup
        v-model:visible="statusPanelVisible"
        trigger="click"
        placement="bottom-left"
        :show-arrow="false"
        overlay-class-name="status-filter-popup"
        overlay-inner-class-name="status-filter-popup-inner"
      >
        <t-button variant="outline" :aria-label="`状态筛选，已勾选 ${checkedStatusCount} 项`">
          状态<template v-if="checkedStatusCount">（{{ checkedStatusCount }}）</template>
          <template #suffix><ChevronDownIcon /></template>
        </t-button>
        <template #content>
          <div class="status-panel">
            <div class="status-panel-head">
              <span class="status-panel-title">状态</span>
              <div class="status-panel-tools">
                <t-button
                  variant="text"
                  size="small"
                  :disabled="checkedStatusCount === statusCheckOptions.length"
                  @click="selectAllStatuses"
                >
                  全选
                </t-button>
                <t-button variant="text" size="small" :disabled="checkedStatusCount === 0" @click="clearAllStatuses">
                  清空
                </t-button>
              </div>
            </div>
            <t-checkbox-group :value="query.status" :options="statusCheckOptions" @change="onStatusChange" />
          </div>
        </template>
      </t-popup>
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        重置
      </t-button>
    </div>

    <div class="page-card">
      <t-table :horizontal-scroll-affixed-bottom="{ container: '.page-scroll', offsetBottom: 0 }"
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @row-click="({ row }: { row: Enterprise }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="ent-cell">
            <!-- 已上传 Logo 即展示图片，未上传或加载失败回退企业首字 -->
            <t-avatar class="ent-avatar" size="36px" :image="row.logo || undefined" hide-on-load-failed>{{ row.name.slice(0, 1) }}</t-avatar>
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

        <template #empty>
          <ListEmptyState :query="query" description="暂无企业" @clear="onReset" />
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
}

.ent-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.op-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* ---------- 状态勾选面板（浮层挂载到 body，scoped 选择器无法命中，故用 :global 收窄到本页唯一类名） ---------- */
:global(.status-filter-popup) {
  padding: 0;
}

:global(.status-filter-popup-inner) {
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.status-panel {
  width: 180px;
  padding: 8px 12px 12px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-2);
}

.status-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.status-panel-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-panel :deep(.t-checkbox-group) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
