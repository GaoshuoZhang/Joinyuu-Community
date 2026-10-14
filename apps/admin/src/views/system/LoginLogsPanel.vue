<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useListQueryState } from '@/utils/listQuery'
import { SearchIcon } from 'tdesign-icons-vue-next'
import { fetchLoginLogs, type LoginLog } from '@/api/login-logs'
import type { TdDateRangePickerProps } from 'tdesign-vue-next'

/* 登录日志：管理员登录成功/失败记录（真实接口 /api/admin/login-logs）。 */
const loading = ref(false)
const loadError = ref('')
const list = ref<LoginLog[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  status: '',
  keyword: '',
  range: ['', ''],
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failed' },
  { label: '锁定', value: 'locked' },
]

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
  query.status = ''
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
}

/* 空态筛选判定：range 为空串占位（['', '']）时视为未筛选（组件按数组长度判断） */
const filterState = computed(() => ({
  status: query.status,
  keyword: query.keyword,
  range: query.range.filter((v) => v),
}))

const { syncQuery } = useListQueryState(query, load, { prefix: 'login.' })

onMounted(load)
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
      <t-select v-accessible-field="'状态'" class="ctl-w-sm" v-model="query.status" label="状态" :options="statusOptions" @change="onSearch" />
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
</style>
