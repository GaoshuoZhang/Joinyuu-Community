<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchShowcaseRequests, reviewShowcaseRequest } from '@/api/contents'
import { showcaseTargetTypeMap } from '@/constants/status'
import type { ShowcaseRequest } from '@/types'

/* 展示页发布面板（迁移自申请审核页的展示页发布类型）：
 * 状态 Tab + 目标类型筛选 + 详情抽屉（审核时间线）+ 通过/驳回意见对话框；
 * 企业目标审核结果联动企业展示页状态（published/rejected），个人目标接入主页实体 */
const loading = ref(false)
const list = ref<ShowcaseRequest[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  targetType: '',
  status: 'pending',
})

const targetTypeOptions = [
  { label: '全部', value: '' },
  { label: '企业展示页', value: 'enterprise' },
  { label: '个人主页', value: 'individual' },
]

const actionTextMap: Record<string, string> = {
  submit: '提交',
  approve: '通过',
  reject: '驳回',
}

const columns = [
  { colKey: 'id', title: '申请编号', width: 110 , ellipsis: true},
  { colKey: 'target', title: '目标', cell: 'target', width: 170, ellipsis: true },
  { colKey: 'targetType', title: '类型', cell: 'targetType', width: 110, resizable: true , ellipsis: true},
  { colKey: 'submitter', title: '提交人', cell: 'submitter', width: 150 , ellipsis: true},
  { colKey: 'contentSummary', title: '内容摘要', ellipsis: true },
  { colKey: 'submittedAt', title: '提交时间', width: 150, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 130 },
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
    const res = await fetchShowcaseRequests({ ...query })
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
const current = ref<ShowcaseRequest | null>(null)

function openDetail(row: ShowcaseRequest) {
  current.value = row
  drawerVisible.value = true
}

/* 通过 / 驳回对话框 */
const dialogVisible = ref(false)
const dialogAction = ref<'approve' | 'reject'>('approve')
const comment = ref('')
const submitting = ref(false)

function openDialog(action: 'approve' | 'reject', row: ShowcaseRequest) {
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
      await reviewShowcaseRequest(current.value.id, 'approved', comment.value)
      MessagePlugin.success('展示页申请已通过')
    } else {
      await reviewShowcaseRequest(current.value.id, 'rejected', comment.value)
      MessagePlugin.success('展示页申请已驳回')
    }
    dialogVisible.value = false
    drawerVisible.value = false
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
  <div class="showcase-panel">
    <div class="page-filter-bar">
      <t-select
        v-model="query.targetType"
        label="目标类型"
        :options="targetTypeOptions"
        clearable
        style="width: 150px"
        @change="onTypeChange"
      />
      <div class="filter-tail">
        <ColumnController
          v-model="visibleColKeys"
          storage-key="showcase"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
      </div>
    </div>

    <div class="page-card">
      <t-tabs :value="query.status" class="status-tabs" @change="onStatusChange">
        <t-tab-panel value="" label="全部" />
        <t-tab-panel value="pending" label="待审核" />
        <t-tab-panel value="approved" label="已通过" />
        <t-tab-panel value="rejected" label="已驳回" />
      </t-tabs>

      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无符合条件的展示页申请"
        @page-change="onPageChange"
        @row-click="({ row }) => openDetail(row)"
      >
        <template #target="{ row }">
          <div class="target-cell">
            <span class="target-name">{{ row.targetName }}</span>
            <t-tag v-if="row.targetId" class="id-tag-block" size="small" variant="light">{{ row.targetId }}</t-tag>
          </div>
        </template>
        <template #targetType="{ row }">
          <t-tag variant="light">{{ showcaseTargetTypeMap[row.targetType]?.label ?? row.targetType }}</t-tag>
        </template>
        <template #submitter="{ row }">
          <div class="target-cell">
            <span class="target-name">{{ row.submitterName }}</span>
            <span class="target-sub">{{ row.submitterPhone }}</span>
          </div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="reservation" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <template v-if="row.status === 'pending'">
              <t-button variant="text" size="small" theme="primary" @click="openDialog('approve', row)">
                通过
              </t-button>
              <t-button variant="text" size="small" theme="danger" @click="openDialog('reject', row)">
                驳回
              </t-button>
            </template>
            <t-button variant="text" size="small" @click="openDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 申请详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="展示页申请详情" size="560px" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <t-tag variant="light">{{ showcaseTargetTypeMap[current.targetType]?.label ?? current.targetType }}</t-tag>
          <StatusTag entity="reservation" :value="current.status" />
        </div>

        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="目标名称">{{ current.targetName }}<t-tag v-if="current.targetId" class="id-tag" size="small" variant="light">{{ current.targetId }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="提交人">{{ current.submitterName }}</t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ current.submitterPhone }}</t-descriptions-item>
          <t-descriptions-item label="提交时间" :span="2">{{ current.submittedAt }}</t-descriptions-item>
        </t-descriptions>

        <p class="drawer-summary">{{ current.contentSummary }}</p>
        <p v-if="current.rejectReason" class="drawer-reject">驳回原因：{{ current.rejectReason }}</p>

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
      :header="dialogAction === 'approve' ? '通过展示页申请' : '驳回展示页申请'"
      width="520px"
      :confirm-btn="{
        content: dialogAction === 'approve' ? '确认通过' : '确认驳回',
        theme: dialogAction === 'approve' ? 'primary' : 'danger',
        loading: submitting,
      }"
      @confirm="onConfirm"
      @close="dialogVisible = false"
    >
      <p v-if="current" class="dialog-tip">
        {{
          dialogAction === 'approve'
            ? current.targetType === 'enterprise'
              ? `通过后企业「${current.targetName}」的展示页将立即发布。`
              : `通过后「${current.targetName}」的个人主页将发布（个人主页实体待接入）。`
            : current.targetType === 'enterprise'
              ? `驳回后企业「${current.targetName}」的展示页状态将同步为未通过。`
              : `驳回「${current.targetName}」的个人主页发布申请。`
        }}
      </p>
      <t-textarea
        v-model="comment"
        placeholder="审核意见（驳回时建议填写原因）"
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
    </t-dialog>
  </div>
</template>

<style scoped>
.status-tabs {
  margin-bottom: 16px;
}

.filter-tail {
  display: flex;
  align-items: center;
  margin-left: auto;
}

.target-cell {
  display: flex;
  flex-direction: column;
}

.target-name {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.target-sub {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
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

.drawer-reject {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
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

.drawer-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--td-component-border);
}

.dialog-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
