<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { safeHttpUrl } from '@/utils/url'
import { useRouter } from 'vue-router'
import { MessagePlugin, type FormProps } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { applicationTypeMap } from '@/constants/status'
import { archiveApplication, approveApplication, fetchApplications, rejectApplication } from '@/api/applications'
import type { Application } from '@/types'

const router = useRouter()

const loading = ref(true)
const loadError = ref('')
const list = ref<Application[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  type: '',
  status: 'pending',
})

/* 申请审核页处理企业入驻、个体入驻、企业合作与企业退驻申请。 */
const typeOptions = [
  { label: '全部', value: '' },
  { label: '企业入驻', value: 'settle' },
  { label: '个体入驻', value: 'individual' },
  { label: '企业合作', value: 'cooperation' },
  { label: '企业退驻', value: 'exit' },
]

const actionTextMap: Record<string, string> = {
  submit: '提交',
  approve: '通过',
  reject: '驳回',
}

const columns = [
  { colKey: 'id', title: '申请编号', width: 110 , ellipsis: true},
  { colKey: 'type', title: '类型', cell: 'type', width: 110 , ellipsis: true},
  { colKey: 'applicant', title: '申请人', cell: 'applicant', width: 140 , ellipsis: true},
  { colKey: 'targetName', title: '申请对象', width: 160, ellipsis: true },
  { colKey: 'summary', title: '摘要', ellipsis: true },
  { colKey: 'submittedAt', title: '提交时间', width: 170 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 140 },
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
    const res = await fetchApplications({ ...query })
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

/* 归档后当前页可能已空：页码越界时回退一页再加载 */
async function reloadAfterRemove() {
  if (list.value.length <= 1 && query.page > 1) query.page -= 1
  await load()
}

function onTypeChange() {
  query.page = 1
  load()
}

/* 清除筛选：恢复默认类型，保留状态 tab */
function onReset() {
  query.type = ''
  query.page = 1
  load()
}

function onStatusChange(value: string | number) {
  query.status = String(value)
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 详情抽屉 */
const drawerVisible = ref(false)
const current = ref<Application | null>(null)

function openDetail(row: Application) {
  current.value = row
  drawerVisible.value = true
}

/* 附件缩略图判定（图片后缀） */
function isImageFile(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
}

/* 审核单打印：打开独立打印页 */
function onPrint(row: Application) {
  window.open(router.resolve({ path: `/prints/approval/${row.id}` }).href, '_blank', 'noopener')
}

/* 归档（已通过 / 已驳回） */
async function onArchive(row: Application) {
  try {
    await archiveApplication(row.id)
    MessagePlugin.success('申请已归档')
    await reloadAfterRemove()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档失败')
  }
}

/* 一键归档：全量拉取申请，归档所选状态的已通过 / 已驳回申请 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
const bulkStatuses = [
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
]

async function doBulkArchive(values: string[]) {
  const targets: Application[] = []
  /* 沿用当前筛选（含申请类型）；最多 20 页（2000 条），超出时提示剩余需再次执行 */
  let truncated = false
  for (let page = 1; page <= 20; page++) {
    const res = await fetchApplications({ ...query, page, pageSize: 100, status: '' })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
    if (page === 20) truncated = true
  }
  const pending = targets.filter((a) => values.includes(a.status))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档申请')
    return
  }
  /* 进度 + 可取消：逐条执行，取消后停止后续条目（见 BulkArchiveDialog 进度态） */
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: pending.length, failed: 0 }
  let done = 0
  let failed = 0
  for (const a of pending) {
    if (bulkCancelled) break
    try {
      await archiveApplication(a.id)
    } catch {
      failed++
    }
    done++
    bulkProgress.value = { done, total: pending.length, failed }
  }
  bulkProgress.value = null
  if (bulkCancelled) {
    MessagePlugin.warning(`已取消执行：本次已归档 ${done - failed} 条`)
  } else {
    if (done - failed > 0) {
      MessagePlugin.success(
        truncated
          ? `已归档 ${done - failed} 条申请，剩余请再次执行`
          : `已归档 ${done - failed} 条申请`,
      )
    }
    if (failed > 0) MessagePlugin.warning(`${failed} 条申请归档失败，请重试`)
  }
  await load()
}

/* 确认前预估影响条数：按所选状态取 total 求和（pageSize=1 仅取 total；类型沿用当前筛选） */
function countByStatus(status: string) {
  return fetchApplications({ ...query, status, page: 1, pageSize: 1 }).then((r) => r.total)
}

function onBulkArchive() {
  bulkVisible.value = true
}

function onBulkCancel() {
  bulkCancelled = true
}

async function onBulkConfirm(values: string[]) {
  archivingAll.value = true
  try {
    await doBulkArchive(values)
    bulkVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '一键归档失败')
  } finally {
    archivingAll.value = false
  }
}

/* 通过 / 驳回对话框 */
const dialogVisible = ref(false)
const dialogAction = ref<'approve' | 'reject'>('approve')
const commentFormRef = ref()
const commentForm = reactive({ comment: '' })
const submitting = ref(false)

/* 驳回必须填写原因（与需求/投稿审核一致），通过时意见可选 */
const commentRules = computed<FormProps['rules']>(() =>
  dialogAction.value === 'reject' ? { comment: [{ required: true, message: '请填写驳回原因', trigger: 'submit' }] } : {},
)

function openDialog(action: 'approve' | 'reject', row: Application) {
  current.value = row
  dialogAction.value = action
  commentForm.comment = ''
  dialogVisible.value = true
  nextTick(() => commentFormRef.value?.clearValidate())
}

async function onConfirm() {
  if (!current.value) return
  const valid = await commentFormRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    if (dialogAction.value === 'approve') {
      await approveApplication(current.value.id, commentForm.comment.trim())
      MessagePlugin.success('已通过')
    } else {
      await rejectApplication(current.value.id, commentForm.comment.trim())
      MessagePlugin.success('已驳回')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="approval-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="申请审核" description="企业入驻、个体入驻、企业合作与企业退驻的统一审核">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="approvals"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
      </template>
    </PageHeader>

    <div class="page-card">
      <!-- 状态页签独占整行：与「申请类型」下拉同排时页签会被挤压，可用宽度不足即溢出成横向滚动箭头 -->
      <t-tabs :value="query.status" class="status-tabs" @change="onStatusChange">
        <t-tab-panel value="" label="全部" />
        <t-tab-panel value="pending" label="待审核" />
        <t-tab-panel value="approved" label="已通过" />
        <t-tab-panel value="rejected" label="已驳回" />
      </t-tabs>

      <div class="filter-row">
        <t-select
          v-model="query.type"
          class="ctl-w-md"
          label="申请类型"
          :options="typeOptions"
          clearable
          @change="onTypeChange"
        />
      </div>

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
        @row-click="({ row }: { row: Application }) => openDetail(row)"
      >
        <template #empty>
          <ListEmptyState :query="query" description="暂无申请" @clear="onReset" />
        </template>
        <template #type="{ row }">
          <t-tag variant="light">{{ applicationTypeMap[row.type]?.label ?? row.type }}</t-tag>
        </template>

        <template #applicant="{ row }">
          <div class="applicant-cell">
            <span class="applicant-name">{{ row.applicantName }}</span>
            <t-tag v-if="row.applicantId" class="id-tag-block" size="small" variant="light">{{ row.applicantId }}</t-tag>
            <span v-else class="applicant-phone">{{ row.applicantPhone }}</span>
          </div>
        </template>

        <template #status="{ row }">
          <StatusTag entity="application" :value="row.status" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button
              v-if="row.status === 'pending'"
              variant="text"
              size="small"
              theme="primary"
              @click="openDetail(row)"
            >
              审核
            </t-button>
            <t-button v-else variant="text" size="small" @click="openDetail(row)">详情</t-button>
            <t-popconfirm
              v-if="row.status === 'approved' || row.status === 'rejected'"
              :content="`确认归档该申请（${row.id}）？归档后可在归档管理中恢复`"
              confirm-btn="归档"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="warning">归档</t-button>
            </t-popconfirm>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 申请详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="申请详情" size="560px" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <t-tag variant="light">{{ applicationTypeMap[current.type]?.label ?? current.type }}</t-tag>
          <StatusTag entity="application" :value="current.status" />
          <t-button class="drawer-print" variant="outline" size="small" @click="onPrint(current)">打印</t-button>
        </div>

        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="申请人">{{ current.applicantName }}</t-descriptions-item>
          <t-descriptions-item label="用户ID">
            <t-tag v-if="current.applicantId" size="small" variant="light">{{ current.applicantId }}</t-tag>
            <span v-else>—</span>
          </t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ current.applicantPhone }}</t-descriptions-item>
          <t-descriptions-item label="申请对象">{{ current.targetName }}</t-descriptions-item>
          <t-descriptions-item label="提交时间">{{ current.submittedAt }}</t-descriptions-item>
        </t-descriptions>

        <p class="drawer-summary">{{ current.summary }}</p>

        <h4 class="drawer-section-title">申请内容</h4>
        <t-descriptions :column="1" bordered>
          <t-descriptions-item v-for="d in current.details" :key="d.label" :label="d.label">
            <div v-if="d.files?.length" class="detail-files">
              <div v-for="(f, i) in d.files" :key="i" class="detail-file">
                <t-image v-if="safeHttpUrl(f.url) && isImageFile(f.name)" :src="safeHttpUrl(f.url)" fit="cover" class="detail-thumb content-img" />
                <a v-if="safeHttpUrl(f.url)" :href="safeHttpUrl(f.url)" target="_blank" rel="noopener noreferrer">{{ f.name }}</a>
                <span v-else>{{ f.name }}</span>
              </div>
            </div>
            <template v-else>{{ d.value }}</template>
          </t-descriptions-item>
        </t-descriptions>

        <h4 class="drawer-section-title">审核记录</h4>
        <!-- mode="same"：TDesign 默认 alternate + 恒生效的 label 类会给圆点列加 margin-left:100px，导致内容整体缩进居中 -->
        <t-timeline class="record-timeline" mode="same">
          <t-timeline-item v-for="(r, i) in current.records" :key="i">
            <div class="record-line">
              <span :class="['record-action', `is-${r.action}`]">{{ actionTextMap[r.action] }}</span>
              <span class="record-text">{{ r.step }} · {{ r.operator }}：{{ r.comment || '无备注' }}</span>
            </div>
            <div class="record-time">{{ r.at }}</div>
          </t-timeline-item>
        </t-timeline>

        <div v-if="current.status === 'pending'" class="drawer-actions">
          <t-button theme="primary" @click="openDialog('approve', current)">通过</t-button>
          <t-button theme="danger" variant="outline" @click="openDialog('reject', current)">驳回</t-button>
        </div>
      </template>
    </t-drawer>

    <!-- 审核意见抽屉 -->
    <t-drawer
      v-model:visible="dialogVisible"
      :header="dialogAction === 'approve' ? '通过审核' : '驳回审核'"
      size="520px"
      :footer="false"
      :close-btn="true"
      :close-on-esc-keydown="true"
    >
      <t-form ref="commentFormRef" :data="commentForm" :rules="commentRules">
        <t-form-item name="comment">
          <t-textarea
            v-model="commentForm.comment"
            :placeholder="dialogAction === 'reject' ? '请填写驳回原因（必填，将通知申请人）…' : '审核意见（可选）…'"
            :autosize="{ minRows: 3, maxRows: 5 }"
          />
        </t-form-item>
      </t-form>
      <div class="drawer-footer">
        <t-button variant="text" theme="default" @click="dialogVisible = false">取消</t-button>
        <t-button
          :theme="dialogAction === 'approve' ? 'primary' : 'danger'"
          :loading="submitting"
          @click="onConfirm"
        >
          {{ dialogAction === 'approve' ? '确认通过' : '确认驳回' }}
        </t-button>
      </div>
    </t-drawer>

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 申请"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      :progress="bulkProgress"
      :count-for-status="countByStatus"
      @confirm="onBulkConfirm"
      @cancel="onBulkCancel"
    />
  </div>
</template>

<style scoped>
.status-tabs {
  margin-bottom: 16px;
}

/* 申请类型筛选：页签下方的无边框筛选行，与表格同处一张卡片内 */
.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 16px;
}

.applicant-cell {
  display: flex;
  flex-direction: column;
}

.applicant-name {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.applicant-phone {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.drawer-id {
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.drawer-summary {
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

.drawer-section-title {
  margin: 20px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.detail-files {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-file {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--td-radius-default);
  overflow: hidden;
  flex-shrink: 0;
}

.record-timeline {
  padding-top: 8px;
}

.record-action {
  margin-right: 8px;
  font-size: 12px;
  font-weight: 600;
}

.record-action.is-submit {
  color: var(--td-text-color-secondary);
}

.record-action.is-approve {
  color: var(--td-success-color);
}

.record-action.is-reject {
  color: var(--td-error-color);
}

.record-text {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.record-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  line-height: 22px;
}

.record-time {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.drawer-print {
  margin-left: auto;
}

.drawer-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--td-component-border);
}

.drawer-footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}
</style>
