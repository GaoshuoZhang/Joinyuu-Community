<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchAuditLogs } from '@/api/auditLogs'
import type { AuditLog, AuditModule } from '@/types'

/* 审计日志：后台管理员的全部写操作记录（谁在何时对什么做了什么）。
 * 各域关键写操作由后端统一留痕（AuditInterceptor + AuditService，含 IP 与 before/after 快照） */
const loading = ref(true)
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
  ...['社区成员', '审批中心', '需求管理', '项目管理', '活动管理', '积分商城', '规则管理', '空间管理', '内容管理', '系统管理'].map(
    (m) => ({ label: m, value: m }),
  ),
]

const moduleThemeMap: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  社区成员: 'primary',
  审批中心: 'warning',
  需求管理: 'primary',
  项目管理: 'success',
  活动管理: 'success',
  积分商城: 'warning',
  规则管理: 'default',
  空间管理: 'primary',
  内容管理: 'success',
  系统管理: 'default',
}

const columns = [
  { colKey: 'at', title: '操作时间', width: 170 },
  { colKey: 'operator', title: '操作人', width: 110 },
  { colKey: 'module', title: '模块', cell: 'module', width: 110 },
  { colKey: 'action', title: '动作', width: 130 },
  { colKey: 'target', title: '操作对象', cell: 'target', minWidth: 220, resizable: true },
  { colKey: 'detail', title: '详情', cell: 'detail', minWidth: 180, resizable: true },
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
    const res = await fetchAuditLogs({ ...query })
    list.value = res.list
    total.value = res.total
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

onMounted(load)
</script>

<template>
  <div class="audit-panel page-fade-in">
    <PageHeader title="审计日志" description="后台管理操作的完整留痕：谁在何时对什么做了什么（M1 起含 IP 与变更快照）" />

    <div class="filter-bar">
      <t-input v-model="query.keyword" clearable placeholder="搜索操作对象/动作/详情/操作人" style="width: 260px" @enter="onSearch" />
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
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.cell-target {
  color: var(--td-text-color-primary);
}

.cell-detail {
  color: var(--td-text-color-secondary);
}
</style>
