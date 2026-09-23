<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { auditModuleThemeMap } from '@/constants/status'
import { fetchAuditLogs } from '@/api/auditLogs'
import type { AuditLog, AuditModule } from '@/types'

/* 操作日志：后台管理员的全部写操作记录（谁在何时对什么做了什么）。
 * 各域关键写操作由后端统一留痕（AuditContextMiddleware 写入请求上下文 + AuditService.record，
 * 含访问 IP 与 before/after 快照） */
const loading = ref(true)
const loadError = ref('')
const list = ref<AuditLog[]>([])
const total = ref(0)

/* 详情抽屉：直接使用列表行数据（含 ip/before/after），无需额外详情接口 */
const drawerVisible = ref(false)
const current = ref<AuditLog | null>(null)

const hasSnapshot = computed(() => current.value?.before != null || current.value?.after != null)

function openDetail(row: AuditLog) {
  current.value = row
  drawerVisible.value = true
}

/* 快照展示文本：结构化 JSON 美化输出；后端因体量超限截断后为字符串，原样展示 */
function snapshotText(value: unknown): string {
  if (value === undefined || value === null) return '—'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

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

const columns = [
  { colKey: 'at', title: '操作时间', width: 170 , ellipsis: true},
  { colKey: 'operator', title: '操作人', width: 110 , ellipsis: true},
  { colKey: 'ip', title: 'IP 地址', cell: 'ip', width: 130 , ellipsis: true},
  { colKey: 'module', title: '模块', cell: 'module', width: 110 , ellipsis: true},
  { colKey: 'action', title: '动作', width: 130 , ellipsis: true},
  { colKey: 'target', title: '操作对象', cell: 'target', width: 220, resizable: true , ellipsis: true},
  { colKey: 'detail', title: '详情', cell: 'detail', width: 180, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 90 },
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
  <div class="audit-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <div class="page-filter-bar">
      <t-input class="ctl-w-xl" v-model="query.keyword" clearable placeholder="搜索操作对象/动作/详情/操作人…" @enter="onSearch" />
      <t-select class="ctl-w-md" v-model="query.module" :options="moduleOptions" @change="onSearch" />
      <t-button theme="primary" @click="onSearch">查询</t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
    </div>

    <div class="page-card">
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
        <t-tag variant="light" :theme="auditModuleThemeMap[row.module] ?? 'default'">{{ moduleOf(row) }}</t-tag>
      </template>
      <template #ip="{ row }">
        <span class="cell-ip">{{ row.ip || '—' }}</span>
      </template>
      <template #target="{ row }">
        <span class="cell-target">{{ row.target }}</span>
      </template>
      <template #detail="{ row }">
        <span class="cell-detail">{{ row.detail || '—' }}</span>
      </template>
      <template #op="{ row }">
        <t-button variant="text" theme="primary" size="small" @click="openDetail(row)">详情</t-button>
      </template>

      <template #empty>
        <ListEmptyState :query="query" description="暂无操作日志" @clear="onReset" />
      </template>
      </t-table>
    </div>

    <!-- 日志详情抽屉：基础信息 + 变更前/变更后快照对照 -->
    <t-drawer
      v-model:visible="drawerVisible"
      header="操作日志详情"
      size="560px"
      :footer="false"
      :close-btn="true"
      :close-on-esc-keydown="true"
    >
      <template v-if="current">
        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="操作时间">{{ current.at }}</t-descriptions-item>
          <t-descriptions-item label="操作人">{{ current.operator }}</t-descriptions-item>
          <t-descriptions-item label="IP 地址">{{ current.ip || '—' }}</t-descriptions-item>
          <t-descriptions-item label="模块">{{ current.module }}</t-descriptions-item>
          <t-descriptions-item label="动作">{{ current.action }}</t-descriptions-item>
          <t-descriptions-item label="对象">{{ current.target }}</t-descriptions-item>
          <t-descriptions-item label="备注" :span="2">{{ current.detail || '—' }}</t-descriptions-item>
        </t-descriptions>

        <h4 class="drawer-section-title">字段变更快照</h4>
        <p v-if="current.snapshotTruncated" class="snapshot-tip">快照过大，以下内容已截断</p>
        <div v-if="hasSnapshot" class="snapshot-grid">
          <div class="snapshot-col">
            <div class="snapshot-title">变更前</div>
            <pre class="snapshot-pre">{{ snapshotText(current.before) }}</pre>
          </div>
          <div class="snapshot-col">
            <div class="snapshot-title">变更后</div>
            <pre class="snapshot-pre">{{ snapshotText(current.after) }}</pre>
          </div>
        </div>
        <div v-else class="snapshot-empty">该操作无字段变更快照</div>
      </template>
    </t-drawer>
  </div>
</template>

<style scoped>
.cell-target {
  color: var(--td-text-color-primary);
}

.cell-detail {
  color: var(--td-text-color-secondary);
}

.cell-ip {
  color: var(--td-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.drawer-section-title {
  margin: 20px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.snapshot-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-warning-color);
}

/* 变更前/变更后两栏对照；窄屏上下堆叠 */
.snapshot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.snapshot-col {
  min-width: 0;
}

.snapshot-title {
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.snapshot-pre {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-container-hover);
  color: var(--td-text-color-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.snapshot-empty {
  font-size: 13px;
  color: var(--td-text-color-placeholder);
}

@media (max-width: 640px) {
  .snapshot-grid {
    grid-template-columns: 1fr;
  }
}
</style>
