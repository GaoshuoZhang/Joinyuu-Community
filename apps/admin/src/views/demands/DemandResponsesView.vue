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
import {
  fetchDemandResponses,
  reviewDemandRespondent,
  updateDemandRespondent,
  type PendingRespondent,
} from '@/api/demands'
import { identityLabelOf } from '@/constants/identity'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { useListQueryState } from '@/utils/listQuery'

/* 响应审核（业务运营 → 响应审核）：集中处理「待审核」（pending_review）的需求响应。
 * 通过 = 弹窗勾选「向需求方显示」的字段（未勾选的对发布者隐藏），响应回到「待选定」并通知发布者；
 * 驳回 = 置失效并通知响应者（必须填写原因）；编辑 = 仅待审核响应可改响应内容（响应方基本信息不可改）。
 * 行级互斥：actingId 记录 `${row.id}:approved|rejected|updated`，同一行同时只允许一个动作在途。
 * `?demandId=` 由需求详情「响应记录」的待审核条目跳转带入，用于只看该需求的待审核响应。 */
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<PendingRespondent[]>([])
const total = ref(0)
const actingId = ref('')

const query = reactive({ page: 1, pageSize: 10, keyword: '', demandId: '' })

const columns = [
  { colKey: 'demand', title: '需求', cell: 'demand', width: 220, ellipsis: true },
  { colKey: 'respondent', title: '响应者', cell: 'respondent', width: 180, ellipsis: true },
  { colKey: 'quote', title: '报价 / 工期', cell: 'quote', width: 170, ellipsis: true },
  { colKey: 'at', title: '提交时间', width: 170, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 110 },
  { colKey: 'op', title: '操作', cell: 'op', width: 220 },
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
  query.demandId = ''
  query.page = 1
  load()
}

/* 需求详情跳转带入的需求筛选：以可关闭标签展示，清除后回到全部待审核响应 */
function clearDemandFilter() {
  if (!query.demandId) return
  query.demandId = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 响应者身份快照 → 标签文案（社区官方显示工作人员角色名；企业身份只显示 社区企业/合作企业） */
function responderIdentityLabel(row: PendingRespondent | null): string {
  return identityLabelOf(row?.responderIdentity)
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

const acting = (row: PendingRespondent, action: 'approved' | 'rejected' | 'updated') =>
  actingId.value === `${row.id}:${action}`

/* 通过响应：勾选「向需求方显示」的字段（默认全选，取消勾选的字段对需求方隐藏） */
const DISPLAY_FIELD_OPTIONS = [
  { label: '响应说明', value: 'message' },
  { label: '报价', value: 'quote' },
  { label: '可投入时间 / 工期', value: 'timeline' },
  { label: '相关经验与案例', value: 'cases' },
  { label: '联系手机', value: 'phone' },
  { label: '联系邮箱', value: 'email' },
]
const ALL_DISPLAY_FIELDS = DISPLAY_FIELD_OPTIONS.map((option) => option.value)

const approveVisible = ref(false)
const approveRow = ref<PendingRespondent | null>(null)
const approveForm = reactive({ fields: [...ALL_DISPLAY_FIELDS] as string[] })
const approveSubmitting = ref(false)

function openApprove(row: PendingRespondent) {
  approveRow.value = row
  approveForm.fields = [...ALL_DISPLAY_FIELDS]
  approveVisible.value = true
}

function closeApprove() {
  if (approveSubmitting.value) return
  approveVisible.value = false
}

async function onConfirmApprove() {
  const row = approveRow.value
  if (!row) return
  /* 未勾选 = 对需求方隐藏：以「全量字段 − 勾选字段」得出 hiddenFields */
  const hiddenFields = ALL_DISPLAY_FIELDS.filter((field) => !approveForm.fields.includes(field))
  actingId.value = `${row.id}:approved`
  approveSubmitting.value = true
  try {
    await reviewDemandRespondent(row.demandId, row.id, { status: 'approved', hiddenFields })
    MessagePlugin.success(hiddenFields.length ? '已通过该响应，部分字段未向需求方展示' : '已通过该响应')
    approveVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    approveSubmitting.value = false
    actingId.value = ''
  }
}

/* 编辑响应内容：仅待审核响应可改，响应方基本信息（响应人/所属/身份）只读展示 */
const editVisible = ref(false)
const editRow = ref<PendingRespondent | null>(null)
const editFormRef = ref()
const editForm = reactive({ message: '', quote: '', timeline: '', cases: '', phone: '', email: '' })
const editSubmitting = ref(false)
const editRules: FormProps['rules'] = {
  message: [{ required: true, message: '请输入响应说明', trigger: 'submit' }],
  phone: [{ validator: (val: string) => !val?.trim() || /^1\d{10}$/.test(val.trim()), message: '请输入正确的手机号', trigger: 'submit' }],
  email: [{ validator: (val: string) => !val?.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()), message: '请输入正确的邮箱', trigger: 'submit' }],
}

const { close: closeEdit, markBaseline: markEditBaseline } = useDialogFormProtection(
  () => ({ ...editForm }),
  editVisible,
  computed(() => editSubmitting.value),
)

function openEdit(row: PendingRespondent) {
  editRow.value = row
  editForm.message = row.message
  editForm.quote = row.quote ?? ''
  editForm.timeline = row.timeline ?? ''
  editForm.cases = row.cases ?? ''
  editForm.phone = row.phone ?? ''
  editForm.email = row.email ?? ''
  editVisible.value = true
  nextTick(() => {
    editFormRef.value?.clearValidate()
    markEditBaseline()
  })
}

async function onConfirmEdit() {
  const row = editRow.value
  if (!row) return
  const valid = await editFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(editFormRef.value)
  actingId.value = `${row.id}:updated`
  editSubmitting.value = true
  try {
    await updateDemandRespondent(row.demandId, row.id, {
      message: editForm.message,
      quote: editForm.quote,
      timeline: editForm.timeline,
      cases: editForm.cases,
      phone: editForm.phone,
      email: editForm.email,
    })
    MessagePlugin.success('响应已更新')
    editVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    editSubmitting.value = false
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
      <!-- 需求详情「响应记录」跳转带入的需求筛选：可关闭标签 -->
      <t-tag
        v-if="query.demandId"
        class="filter-tag"
        theme="primary"
        variant="light"
        closable
        @close="clearDemandFilter"
      >
        需求 {{ query.demandId }}
      </t-tag>
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
            <t-button variant="text" size="small" :loading="acting(row, 'updated')" @click="openEdit(row)">编辑</t-button>
            <t-button variant="text" size="small" theme="primary" :loading="acting(row, 'approved')" @click="openApprove(row)">通过</t-button>
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
          <t-button theme="primary" :loading="acting(current, 'approved')" @click="openApprove(current)">通过</t-button>
          <t-button theme="danger" variant="outline" :loading="acting(current, 'rejected')" @click="openReject(current)">驳回</t-button>
        </div>
      </template>
    </t-drawer>

    <!-- 通过响应：勾选「向需求方显示」的字段（默认全选；取消勾选的对需求方隐藏） -->
    <t-dialog
      :visible="approveVisible"
      header="通过响应"
      width="520px"
      :close-on-overlay-click="!approveSubmitting"
      @close="closeApprove"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" :disabled="approveSubmitting" @click="closeApprove">取消</t-button>
          <t-button theme="primary" :loading="approveSubmitting" @click="onConfirmApprove">确认通过</t-button>
        </div>
      </template>
      <p class="dialog-target">
        通过「{{ approveRow?.name }}」对需求「{{ approveRow?.demandTitle }}」的响应？通过后发布者可查看并选定该响应。
      </p>
      <div class="approve-block">
        <span class="approve-label">向需求方显示</span>
        <p class="approve-hint">取消勾选的字段，需求方在需求详情中不可见（后台始终保留完整记录）。</p>
        <t-checkbox-group v-model="approveForm.fields" :options="DISPLAY_FIELD_OPTIONS" />
      </div>
    </t-dialog>

    <!-- 编辑响应：仅待审核响应可改；响应方基本信息只读 -->
    <t-dialog
      :visible="editVisible"
      header="编辑响应"
      width="520px"
      :close-on-overlay-click="!editSubmitting"
      @close="closeEdit"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" :disabled="editSubmitting" @click="closeEdit">取消</t-button>
          <t-button theme="primary" :loading="editSubmitting" @click="onConfirmEdit">保存</t-button>
        </div>
      </template>
      <p class="dialog-target">
        响应方：{{ editRow?.name }}（{{ responderIdentityLabel(editRow) }}{{ editRow?.enterprise ? ` · ${editRow.enterprise}` : '' }}）
        —— 响应方基本信息不可编辑。
      </p>
      <t-form ref="editFormRef" :data="editForm" :rules="editRules" label-align="top">
        <t-form-item label="响应说明" name="message">
          <t-textarea v-accessible-field v-model="editForm.message" :maxlength="500" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="请填写响应说明…" />
        </t-form-item>
        <t-form-item label="报价" name="quote">
          <t-input v-accessible-field v-model="editForm.quote" :maxlength="64" placeholder="选填，如 3-5 万元…" />
        </t-form-item>
        <t-form-item label="可投入时间 / 预计工期" name="timeline">
          <t-input v-accessible-field v-model="editForm.timeline" :maxlength="128" placeholder="选填，如 2 周内可开工…" />
        </t-form-item>
        <t-form-item label="相关经验与案例" name="cases">
          <t-textarea v-accessible-field v-model="editForm.cases" :maxlength="300" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="选填，可填写同类项目经验、案例或资源…" />
        </t-form-item>
        <t-form-item label="联系手机" name="phone">
          <t-input v-accessible-field v-model="editForm.phone" :maxlength="11" placeholder="选填；留空表示清除该字段" />
        </t-form-item>
        <t-form-item label="联系邮箱" name="email">
          <t-input v-accessible-field v-model="editForm.email" :maxlength="128" placeholder="选填；留空表示清除该字段" />
        </t-form-item>
      </t-form>
    </t-dialog>

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

.filter-tag {
  margin-left: 4px;
}

/* 通过 / 编辑弹窗的目标说明与「向需求方显示」勾选区 */
.dialog-target {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

.approve-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.approve-label {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.approve-hint {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 20px;
  color: var(--td-text-color-placeholder);
}
</style>
