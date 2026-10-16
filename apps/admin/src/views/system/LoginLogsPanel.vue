<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useListQueryState } from '@/utils/listQuery'
import { ChevronDownIcon, SearchIcon } from 'tdesign-icons-vue-next'
import { fetchLoginLogs, type LoginLog } from '@/api/login-logs'
import type { TdDateRangePickerProps } from 'tdesign-vue-next'

/* 登录日志：管理员登录成功/失败记录（真实接口 /api/admin/login-logs）。 */
const loading = ref(false)
const loadError = ref('')
const list = ref<LoginLog[]>([])
const total = ref(0)

/* 状态勾选式筛选（同活动管理）：3 个可选状态（不含「全部」项）；
 * 默认勾选全部三项（默认仍展示全部记录，但可单独勾选分析）；
 * 全部取消勾选 = 不按状态过滤（显示全部） */
const statusCheckOptions = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '锁定', value: 'locked' },
]
const DEFAULT_STATUSES = ['success', 'failed', 'locked']

const query = reactive({
  page: 1,
  pageSize: 10,
  /* 勾选式状态筛选：数组（useListQueryState 以重复 query 参数同步）；空串占位 = 不按状态过滤 */
  status: [...DEFAULT_STATUSES] as string[],
  keyword: '',
  range: ['', ''],
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

const columns = [
  { colKey: 'createdAt', title: '登录时间', width: 170, resizable: true , ellipsis: true},
  { colKey: 'user', title: '登录账号', cell: 'user', width: 140, resizable: true , ellipsis: true},
  { colKey: 'ip', title: 'IP 地址', width: 130 , ellipsis: true},
  { colKey: 'region', title: '归属地', width: 110 , ellipsis: true},
  { colKey: 'device', title: '设备', width: 170, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 90 , ellipsis: true},
  { colKey: 'failedReason', title: '失败原因', cell: 'failedReason', width: 120 , ellipsis: true},
]

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
    const res = await fetchLoginLogs({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
      startDate: query.range[0] || undefined,
      endDate: query.range[1] || undefined,
    })
    if (current === version) {
      list.value = res.list
      total.value = res.total
    }
  } catch (e) {
    if (current === version) {
      /* 错误经 ListErrorState 组件呈现，不再重复弹 toast */
      loadError.value = e instanceof Error ? e.message : '数据加载失败'
    }
  } finally {
    if (current === version) loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.status = [...DEFAULT_STATUSES]
  query.keyword = ''
  query.range = ['', '']
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function onRangeChange(v: TdDateRangePickerProps['value']) {
  query.range = Array.isArray(v) ? (v as string[]) : ['', '']
  onSearch()
}

/* 空态筛选判定：勾选集等于默认集（顺序无关比较）时视为未筛选，避免默认态显示「没有符合筛选条件的结果」；
 * range 为空串占位（['', '']）时同样视为未筛选（组件按数组长度判断） */
const statusIsFiltered = computed(() => {
  const picked = query.status.filter(Boolean)
  const sort = (a: string[]) => [...a].sort()
  return picked.length > 0 && JSON.stringify(sort(picked)) !== JSON.stringify(sort(DEFAULT_STATUSES))
})
const filterState = computed(() => ({
  status: statusIsFiltered.value ? query.status : '',
  keyword: query.keyword,
  range: query.range.filter((v) => v),
}))

const { syncQuery } = useListQueryState(query, load, { prefix: 'login.' })

onMounted(() => {
  window.addEventListener('keydown', onStatusPanelKeydown)
  load()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onStatusPanelKeydown))
</script>

<template>
  <!-- 内嵌于「日志与审计」聚合壳：入场动画由壳层统一承担，避免双层重播 -->
  <div class="login-logs-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索账号/姓名/IP'" class="ctl-w-xl"
        v-model="query.keyword"
        clearable
        placeholder="搜索账号/姓名/IP…"
        @enter="onSearch"
      />
      <!-- 状态：勾选式多选（默认勾选全部三项，全部取消 = 不按状态过滤）；勾选即查询 -->
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
      <t-date-range-picker
        v-accessible-field="'登录日期范围'"
        v-model="query.range"
        :clearable="true"
        class="ctl-w-xl"
        separator="至"
        @change="onRangeChange"
      />
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
      >
        <template #user="{ row }">
          <div class="cell-user">
            <span class="user-name">{{ row.name }}</span>
            <span class="user-sub">{{ row.username }}</span>
          </div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="loginLog" :value="row.status" />
        </template>
        <template #failedReason="{ row }">
          <span v-if="row.failedReason" class="fail-reason">{{ row.failedReason }}</span>
          <span v-else class="muted">—</span>
        </template>

        <template #empty>
          <ListEmptyState :query="filterState" description="暂无登录日志" @clear="onReset" />
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.cell-user {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-sub {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.fail-reason {
  color: var(--td-error-color);
}

.muted {
  color: var(--td-text-color-placeholder);
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
