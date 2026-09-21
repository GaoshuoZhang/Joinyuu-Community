<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import PageHeader from '@/components/PageHeader.vue'
import { fetchAuditLogs } from '@/api/auditLogs'
import type { AuditLog, AuditModule } from '@/types'

/* 操作日志：后台管理员的全部写操作记录（谁在何时对什么做了什么）。
 * 各域关键写操作由后端统一留痕（AuditInterceptor + AuditService，含 IP 与 before/after 快照） */
const loading = ref(true)
const loadError = ref('')
const list = ref<AuditLog[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  module: '',
})

const moduleOptions = [
  { label: '全部模块', value: '' },
  ...[
    '社区成员',
    '社区企业',
    '合作企业',
    '审核中心',
    '需求管理',
    '项目管理',
    '活动管理',
    '积分商城',
    '空间管理',
    '内容管理',
    '素材库',
    'RBAC',
    '系统管理',
    '归档管理',
    '认证',
  ].map((m) => ({ label: m, value: m })),
]

const moduleThemeMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  社区成员: 'primary',
  社区企业: 'primary',
  合作企业: 'primary',
  审核中心: 'warning',
  需求管理: 'primary',
  项目管理: 'success',
  活动管理: 'success',
  积分商城: 'warning',
  空间管理: 'primary',
  内容管理: 'success',
  素材库: 'success',
  RBAC: 'default',
  系统管理: 'default',
  归档管理: 'default',
  认证: 'default',
}

const columns = [
  { colKey: 'at', title: '操作时间', width: 170 , ellipsis: true},
  { colKey: 'operator', title: '操作人', width: 110 , ellipsis: true},
  { colKey: 'module', title: '模块', cell: 'module', width: 110 , ellipsis: true},
  { colKey: 'action', title: '动作', width: 130 , ellipsis: true},
  { colKey: 'target', title: '操作对象', cell: 'target', width: 220, resizable: true , ellipsis: true},
  { colKey: 'detail', title: '详情', cell: 'detail', width: 180, resizable: true , ellipsis: true},
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
    const res = await fetchAuditLogs({ ...query })
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
  query.module = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function moduleOf(row: AuditLog): AuditModule {
  return row.module
}

const { syncQuery } = useListQueryState(query, load, { prefix: 'audit.' })

onMounted(load)
</script>

<template>
  <div class="audit-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="操作日志" description="后台管理操作的完整留痕：谁在何时对什么做了什么" />

    <div class="page-filter-bar">
      <t-input v-model="query.keyword" clearable placeholder="搜索操作对象/动作/详情/操作人…" style="width: 260px" @enter="onSearch" />
      <t-select v-model="query.module" :options="moduleOptions" clearable style="width: 160px" @change="onSearch" />
      <t-button theme="primary" @click="onSearch">查询</t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
    </div>

    <t-table
      row-key="id"
      table-layout="fixed"
      hover
      :loading="loading"
      :data="list"
      :columns="columns"
      :pagination="pagination"
      empty="暂无操作日志"
      @page-change="onPageChange"
    >
      <template #module="{ row }">
        <t-tag variant="light" :theme="moduleThemeMap[row.module] ?? 'default'">{{ moduleOf(row) }}</t-tag>
      </template>
      <template #target="{ row }">
        <span class="cell-target">{{ row.target }}</span>
      </template>
      <template #detail="{ row }">
        <span class="cell-detail">{{ row.detail || '—' }}</span>
      </template>
    </t-table>
  </div>
</template>

<style scoped>
.cell-target {
  color: var(--td-text-color-primary);
}

.cell-detail {
  color: var(--td-text-color-secondary);
}
</style>
