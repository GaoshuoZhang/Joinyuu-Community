<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import UsageBoardPanel from './UsageBoardPanel.vue'
import { cancelReservation, fetchReservations, fetchSpaces, reviewReservation } from '@/api/spaces'
import type { Space, SpaceReservation } from '@/types'

/* 公共空间预约页（独立路由页）：预约审批 + 当日使用看板（原公共空间 Tab 壳的两个板块合并）；
 * 状态 Tab + 空间/日期筛选 + 详情抽屉（审批时间线）+ 通过/驳回意见对话框；
 * 通过时服务端校验时段冲突（已通过预约 / 已发布活动占用） */
const loading = ref(false)
const list = ref<SpaceReservation[]>([])
const total = ref(0)
const spaces = ref<Space[]>([])
const acting = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  spaceId: '',
  status: 'pending',
  date: '',
})

const spaceOptions = computed(() => [
  { label: '全部空间', value: '' },
  ...spaces.value.map((s) => ({ label: s.name, value: s.id })),
])

const actionTextMap: Record<string, string> = {
  submit: '提交',
  approve: '通过',
  reject: '驳回',
}

const columns = [
  { colKey: 'id', title: '预约编号', width: 110 },
  { colKey: 'user', title: '预约人', cell: 'user', width: 140 },
  { colKey: 'spaceName', title: '空间', width: 130, ellipsis: true },
  { colKey: 'slot', title: '日期 / 时段', cell: 'slot', width: 190, resizable: true },
  { colKey: 'purpose', title: '用途', ellipsis: true },
  { colKey: 'attendees', title: '人数', width: 70, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 170 },
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
    const res = await fetchReservations({ ...query })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadSpaces() {
  try {
    spaces.value = await fetchSpaces()
  } catch {
    /* 筛选选项加载失败不阻塞列表 */
  }
}

function onSpaceChange() {
  query.page = 1
  load()
}

function onStatusChange(value: string | number) {
  query.status = String(value)
  query.page = 1
  load()
}

function onDateChange() {
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
const current = ref<SpaceReservation | null>(null)

function openDetail(row: SpaceReservation) {
  current.value = row
  drawerVisible.value = true
}

/* 通过 / 驳回对话框 */
const dialogVisible = ref(false)
const dialogAction = ref<'approve' | 'reject'>('approve')
const comment = ref('')
const submitting = ref(false)

function openDialog(action: 'approve' | 'reject', row: SpaceReservation) {
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
      await reviewReservation(current.value.id, 'approved', comment.value)
      MessagePlugin.success('预约已通过')
    } else {
      await reviewReservation(current.value.id, 'rejected', comment.value)
      MessagePlugin.success('预约已驳回')
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

/* 管理端取消（待审批/已通过） */
async function onCancel(row: SpaceReservation) {
  acting.value = row.id
  try {
    await cancelReservation(row.id)
    MessagePlugin.success('预约已取消')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

onMounted(() => {
  loadSpaces()
  load()
})
</script>

<template>
  <div class="reservation-panel page-fade-in">
    <PageHeader title="公共空间预约" description="空间预约的审批处理与当日使用看板" />

    <div class="page-filter-bar">
      <t-select
        v-model="query.spaceId"
        label="空间"
        :options="spaceOptions"
        clearable
        style="width: 170px"
        @change="onSpaceChange"
      />
      <t-date-picker
        v-model="query.date"
        valueType="YYYY-MM-DD"
        clearable
        placeholder="按预约日期筛选"
        style="width: 180px"
        @change="onDateChange"
      />
    </div>

    <div class="page-card">
      <t-tabs :value="query.status" class="status-tabs" @change="onStatusChange">
        <t-tab-panel value="" label="全部" />
        <t-tab-panel value="pending" label="待审批" />
        <t-tab-panel value="approved" label="已通过" />
        <t-tab-panel value="rejected" label="已驳回" />
        <t-tab-panel value="cancelled" label="已取消" />
      </t-tabs>

      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无符合条件的预约"
        @page-change="onPageChange"
        @row-click="({ row }) => openDetail(row)"
      >
        <template #user="{ row }">
          <div class="user-cell">
            <span class="user-name">{{ row.userName }}</span>
            <span class="user-phone">{{ row.phone }}</span>
          </div>
        </template>
        <template #slot="{ row }">
          {{ row.date }} {{ row.startTime }} ~ {{ row.endTime }}
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
            <t-popconfirm
              v-if="row.status === 'pending' || row.status === 'approved'"
              content="确认取消该预约？"
              @confirm="onCancel(row)"
            >
              <t-button variant="text" size="small" :loading="acting === row.id">取消</t-button>
            </t-popconfirm>
            <t-button variant="text" size="small" @click="openDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 当日使用看板（原公共空间·使用看板板块） -->
    <div class="board-section">
      <h4 class="board-section-title">当日使用看板</h4>
      <UsageBoardPanel />
    </div>

    <!-- 预约详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="预约详情" size="560px" :footer="false">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <StatusTag entity="reservation" :value="current.status" />
        </div>

        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="预约人">{{ current.userName }}</t-descriptions-item>
          <t-descriptions-item label="手机号">{{ current.phone }}</t-descriptions-item>
          <t-descriptions-item label="空间">{{ current.spaceName }}</t-descriptions-item>
          <t-descriptions-item label="人数">{{ current.attendees }}</t-descriptions-item>
          <t-descriptions-item label="日期">{{ current.date }}</t-descriptions-item>
          <t-descriptions-item label="时段">{{ current.startTime }} ~ {{ current.endTime }}</t-descriptions-item>
        </t-descriptions>

        <p class="drawer-summary">{{ current.purpose }}</p>
        <p v-if="current.rejectReason" class="drawer-reject">驳回原因：{{ current.rejectReason }}</p>

        <h4 class="drawer-section-title">审批记录</h4>
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

    <!-- 审批意见对话框 -->
    <t-dialog
      v-model:visible="dialogVisible"
      :header="dialogAction === 'approve' ? '通过预约' : '驳回预约'"
      width="520px"
      :confirm-btn="{
        content: dialogAction === 'approve' ? '确认通过' : '确认驳回',
        theme: dialogAction === 'approve' ? 'primary' : 'danger',
        loading: submitting,
      }"
      @confirm="onConfirm"
      @close="dialogVisible = false"
    >
      <p v-if="dialogAction === 'approve'" class="dialog-tip">
        通过前系统将自动校验时段冲突（已通过预约与社区活动占用）。
      </p>
      <t-textarea
        v-model="comment"
        placeholder="审批意见（驳回时建议填写原因）"
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
    </t-dialog>
  </div>
</template>

<style scoped>
.status-tabs {
  margin-bottom: 16px;
}

.user-cell {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.user-phone {
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

.board-section {
  margin-top: 24px;
}

.board-section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
</style>
