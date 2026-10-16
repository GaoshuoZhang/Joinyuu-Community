<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ColumnController from '@/components/ColumnController.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { fetchDemandResponses, reviewDemandRespondent, type PendingRespondent } from '@/api/demands'
import { identityLabelOf } from '@/constants/identity'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { useListQueryState } from '@/utils/listQuery'

/* 响应审核（业务运营 → 响应审核）：集中处理「待审核」（pending_review）的需求响应。
 * 通过 = 响应回到「待选定」并通知发布者；驳回 = 置失效并通知响应者（必须填写原因）。
 * 行级互斥：actingId 记录 `${row.id}:approved|rejected`，同一行同时只允许一个动作在途。 */
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<PendingRespondent[]>([])
const total = ref(0)
const actingId = ref('')

const query = reactive({ page: 1, pageSize: 10, keyword: '' })

const columns = [
  { colKey: 'demand', title: '需求', cell: 'demand', width: 220, ellipsis: true },
  { colKey: 'respondent', title: '响应者', cell: 'respondent', width: 180, ellipsis: true },
  { colKey: 'quote', title: '报价 / 工期', cell: 'quote', width: 170, ellipsis: true },
  { colKey: 'at', title: '提交时间', width: 170, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 110 },
  { colKey: 'op', title: '操作', cell: 'op', width: 190 },
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

let loadRequest = 0
async function load() {
  const requestId = ++loadRequest
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchDemandResponses({ ...query })
    if (requestId !== loadRequest) return
    list.value = res.list
    total.value = res.total
  } catch (e) {
    if (requestId !== loadRequest) return
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (requestId === loadRequest) loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 响应者身份快照 → 标签文案（社区官方显示工作人员角色名；企业身份只显示 社区企业/合作企业） */
function responderIdentityLabel(row: PendingRespondent): string {
  return identityLabelOf(row.responderIdentity)
}

const { syncQuery } = useListQueryState(query, load)

/* 详情抽屉：先看全留言/工期/案例/联系方式，再决定通过或驳回 */
const detailVisible = ref(false)
const current = ref<PendingRespondent | null>(null)

function openDetail(row: PendingRespondent) {
  current.value = row
  detailVisible.value = true
}

function goDemand(row: PendingRespondent) {
  router.push(`/demands/${row.demandId}`)
}

const acting = (row: PendingRespondent, action: 'approved' | 'rejected') =>
  actingId.value === `${row.id}:${action}`

async function onApprove(row: PendingRespondent) {
  actingId.value = `${row.id}:approved`
  try {
    await reviewDemandRespondent(row.demandId, row.id, { status: 'approved' })
    MessagePlugin.success('已通过该响应')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    actingId.value = ''
  }
}

/* 驳回：原因必填（未保存保护与需求详情口径一致） */
const rejectVisible = ref(false)
const rejectRow = ref<PendingRespondent | null>(null)
const rejectFormRef = ref()
const rejectForm = reactive({ reason: '' })
const rejectSubmitting = ref(false)
const rejectRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写驳回原因', trigger: 'submit' }],
}

const { close: closeReject, markBaseline: markRejectBaseline } = useDialogFormProtection(
  () => rejectForm,
  rejectVisible,
  computed(() => rejectSubmitting.value),
)

function openReject(row: PendingRespondent) {
  rejectRow.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
  nextTick(() => {
    rejectFormRef.value?.clearValidate()
    markRejectBaseline()
  })
}

async function onConfirmReject() {
  const row = rejectRow.value
  if (!row) return
  const valid = await rejectFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(rejectFormRef.value)
  rejectSubmitting.value = true
  try {
    await reviewDemandRespondent(row.demandId, row.id, { status: 'rejected', reason: rejectForm.reason })
    MessagePlugin.success('已驳回该响应')
    rejectVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    rejectSubmitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="demand-responses page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="响应审核" description="集中处理待审核的需求响应：通过后交由发布者选定承接方，驳回需填写原因">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="demand-responses"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-accessible-field="'搜索响应者/企业/留言/需求编号'"
        v-model="query.keyword"
        class="ctl-w-xl"
        placeholder="搜索响应者/企业/留言/需求编号…"
        clearable
        @enter="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">重置</t-button>
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
        @page-change="onPageChange"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @row-click="({ row }: { row: PendingRespondent }) => openDetail(row)"
      >
        <template #demand="{ row }">
          <div class="stack-cell">
            <span class="stack-title">{{ row.demandTitle }}</span>
            <span class="stack-sub">{{ row.demandId }} · {{ row.publisherName }}</span>
          </div>
        </template>

        <template #respondent="{ row }">
          <div class="stack-cell">
            <span class="stack-title">{{ row.name }}</span>
            <div class="tag-row">
              <t-tag size="small" variant="light">{{ responderIdentityLabel(row) }}</t-tag>
              <span v-if="row.enterprise" class="stack-sub">{{ row.enterprise }}</span>
            </div>
          </div>
        </template>

        <template #quote="{ row }">
          <div class="stack-cell">
            <span class="stack-title">{{ row.quote || '—' }}</span>
            <span v-if="row.timeline" class="stack-sub">{{ row.timeline }}</span>
          </div>
        </template>

        <template #status="{ row }">
          <StatusTag entity="demandRespondent" :value="row.status" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="openDetail(row)">详情</t-button>
            <t-button variant="text" size="small" theme="primary" :loading="acting(row, 'approved')" @click="onApprove(row)">通过</t-button>
            <t-button variant="text" size="small" theme="danger" :loading="acting(row, 'rejected')" @click="openReject(row)">驳回</t-button>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无待审核的响应" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 响应详情抽屉 -->
    <t-drawer v-model:visible="detailVisible" header="响应详情" size="min(560px, 100vw)" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">响应 #{{ current.id }}</span>
          <StatusTag entity="demandRespondent" :value="current.status" />
        </div>

        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="需求">{{ current.demandTitle }}</t-descriptions-item>
          <t-descriptions-item label="需求编号">
            <t-link theme="primary" @click="goDemand(current)">{{ current.demandId }}</t-link>
          </t-descriptions-item>
          <t-descriptions-item label="发布者">{{ current.publisherName }}</t-descriptions-item>
          <t-descriptions-item label="提交时间">{{ current.at }}</t-descriptions-item>
          <t-descriptions-item label="响应者">{{ current.name }}</t-descriptions-item>
          <t-descriptions-item label="身份">{{ responderIdentityLabel(current) }}</t-descriptions-item>
          <t-descriptions-item label="所属">{{ current.enterprise || '—' }}</t-descriptions-item>
          <t-descriptions-item label="报价">{{ current.quote || '—' }}</t-descriptions-item>
          <t-descriptions-item label="可投入时间 / 工期">{{ current.timeline || '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系方式">{{ [current.phone, current.email].filter(Boolean).join(' · ') || '—' }}</t-descriptions-item>
          <t-descriptions-item label="相关经验与案例" :span="2">{{ current.cases || '—' }}</t-descriptions-item>
          <t-descriptions-item label="响应说明" :span="2">{{ current.message }}</t-descriptions-item>
        </t-descriptions>

        <div v-if="current.status === 'pending_review'" class="drawer-actions">
          <t-button theme="primary" :loading="acting(current, 'approved')" @click="onApprove(current)">通过</t-button>
          <t-button theme="danger" variant="outline" :loading="acting(current, 'rejected')" @click="openReject(current)">驳回</t-button>
        </div>
      </template>
    </t-drawer>

    <!-- 驳回响应：原因必填 -->
    <t-dialog
      :visible="rejectVisible"
      header="驳回响应"
      width="520px"
      @close="closeReject"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeReject">取消</t-button>
          <t-button theme="danger" :loading="rejectSubmitting" @click="onConfirmReject">确认驳回</t-button>
        </div>
      </template>
      <p class="reject-target">
        驳回「{{ rejectRow?.name }}」对需求「{{ rejectRow?.demandTitle }}」的响应？驳回后该响应失效，响应者可重新响应。
      </p>
      <t-form ref="rejectFormRef" :data="rejectForm" :rules="rejectRules" label-align="top">
        <t-form-item label="驳回原因" name="reason">
          <t-textarea v-accessible-field v-model="rejectForm.reason" :autosize="{ minRows: 3, maxRows: 5 }" placeholder="请说明驳回原因（会通知响应者）…" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.stack-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.stack-title {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.stack-sub {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.drawer-id {
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.drawer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.reject-target {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}
</style>
