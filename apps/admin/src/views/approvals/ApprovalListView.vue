<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import { applicationTypeMap } from '@/constants/status'
import { archiveApplication, approveApplication, fetchApplications, rejectApplication } from '@/api/applications'
import type { Application } from '@/types'

const router = useRouter()

const loading = ref(true)
const list = ref<Application[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  type: '',
  status: 'pending',
})

/* 申请审核页处理四类申请：企业入驻 / 个体入驻 / 企业合作 / 身份绑定 */
const typeOptions = [
  { label: '全部', value: '' },
  { label: '企业入驻', value: 'settle' },
  { label: '个体入驻', value: 'individual' },
  { label: '企业合作', value: 'cooperation' },
  { label: '身份绑定', value: 'identity' },
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
  { colKey: 'submittedAt', title: '提交时间', width: 150 , ellipsis: true},
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

async function load() {
  loading.value = true
  try {
    const res = await fetchApplications({ ...query })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function onTypeChange() {
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

/* 审核单打印：打开独立打印页 */
function onPrint(row: Application) {
  window.open(router.resolve({ path: `/prints/approval/${row.id}` }).href, '_blank', 'noopener')
}

/* 归档（已通过 / 已驳回） */
async function onArchive(row: Application) {
  try {
    await archiveApplication(row.id)
    MessagePlugin.success('申请已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档失败')
  }
}

/* 一键归档：全量拉取申请，归档所选状态的已通过 / 已驳回申请 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
const bulkStatuses = [
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
]

async function doBulkArchive(values: string[]) {
  const targets: Application[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetchApplications({ page, pageSize: 100, status: '' })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
  }
  const pending = targets.filter((a) => values.includes(a.status))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档申请')
    return
  }
  let failed = 0
  for (const a of pending) {
    try {
      await archiveApplication(a.id)
    } catch {
      failed++
    }
  }
  if (pending.length - failed > 0) MessagePlugin.success(`已归档 ${pending.length - failed} 条申请`)
  if (failed > 0) MessagePlugin.warning(`${failed} 条申请归档失败，请重试`)
  await load()
}

function onBulkArchive() {
  bulkVisible.value = true
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
const comment = ref('')
const submitting = ref(false)

function openDialog(action: 'approve' | 'reject', row: Application) {
  current.value = row
  dialogAction.value = action
  comment.value = ''
  dialogVisible.value = true
}

async function onConfirm() {
  if (!current.value) return
  submitting.value = true
  try {
    if (dialogAction.value === 'approve') {
      await approveApplication(current.value.id, comment.value)
      MessagePlugin.success('已通过')
    } else {
      await rejectApplication(current.value.id, comment.value)
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

onMounted(load)
</script>

<template>
  <div class="approval-list page-fade-in">
    <PageHeader title="申请审核" description="企业入驻、个体入驻、企业合作与身份绑定的统一审核">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="approvals"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="tabs-row">
        <t-tabs :value="query.status" class="status-tabs" @change="onStatusChange">
          <t-tab-panel value="" label="全部" />
          <t-tab-panel value="pending" label="待审核" />
          <t-tab-panel value="approved" label="已通过" />
          <t-tab-panel value="rejected" label="已驳回" />
        </t-tabs>
        <t-select
          v-model="query.type"
          label="申请类型"
          :options="typeOptions"
          clearable
          style="width: 150px; margin-left: 24px"
          @change="onTypeChange"
        />
        <t-button class="bulk-archive-btn" variant="outline" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
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
        empty="暂无符合条件的申请"
        @page-change="onPageChange"
        @row-click="({ row }) => openDetail(row)"
      >
        <template #type="{ row }">
          <t-tag variant="light">{{ applicationTypeMap[row.type].label }}</t-tag>
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
              content="确认归档该申请？归档后可在归档管理中恢复"
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
          <t-tag variant="light">{{ applicationTypeMap[current.type].label }}</t-tag>
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
            {{ d.value }}
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

    <!-- 审核意见对话框 -->
    <t-dialog
      v-model:visible="dialogVisible"
      :header="dialogAction === 'approve' ? '通过审核' : '驳回审核'"
      width="520px"
      :confirm-btn="{
        content: dialogAction === 'approve' ? '确认通过' : '确认驳回',
        theme: dialogAction === 'approve' ? 'primary' : 'danger',
        loading: submitting,
      }"
      @confirm="onConfirm"
      @close="dialogVisible = false"
    >
      <t-textarea
        v-model="comment"
        placeholder="审核意见（可选）"
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
    </t-dialog>

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 申请"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      @confirm="onBulkConfirm"
    />
  </div>
</template>

<style scoped>
.tabs-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.bulk-archive-btn {
  margin-left: auto;
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
  font-size: 13px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

.drawer-section-title {
  margin: 20px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
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
  font-size: 13px;
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
</style>
