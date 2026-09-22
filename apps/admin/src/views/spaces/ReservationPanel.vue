<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import { archiveReservation, cancelReservation, fetchReservations, fetchSpaces, reviewReservation } from '@/api/spaces'
import { deriveReservationStatus } from '@/utils/reservation'
import type { Space, SpaceReservation } from '@/types'

/* 公共空间预约页（独立路由页）：预约审核；
 * 状态 Tab + 空间/日期筛选 + 详情抽屉（审核时间线）+ 通过/驳回意见抽屉；
 * 通过时服务端校验时段冲突（已通过预约 / 已发布活动占用） */
const loading = ref(false)
const loadError = ref('')
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
  { colKey: 'id', title: '预约编号', width: 110 , ellipsis: true},
  { colKey: 'user', title: '预约人', cell: 'user', width: 120 , ellipsis: true},
  { colKey: 'spaceName', title: '空间', width: 120, ellipsis: true },
  { colKey: 'slot', title: '日期 / 时段', cell: 'slot', width: 170, resizable: true , ellipsis: true},
  { colKey: 'purpose', title: '用途', ellipsis: true },
  { colKey: 'attendees', title: '人数', width: 70, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true , ellipsis: true},
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

/* 六态筛选：待使用/使用中/已结束共用 API status=approved，返回后按派生状态客户端过滤；
 * 分页保持服务端口径（客户端过滤仅作用于当前页，为既定取舍） */
const DERIVED_STATUSES = ['approved', 'using', 'ended']

/* 请求序号守卫：仅最后一次请求可写回状态，避免快速切页/改筛选时的竞态覆盖 */
let version = 0
async function load() {
  const current = ++version
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const apiStatus = DERIVED_STATUSES.includes(query.status) ? 'approved' : query.status
    const res = await fetchReservations({ ...query, status: apiStatus })
    if (current === version) {
      list.value = DERIVED_STATUSES.includes(query.status)
        ? res.list.filter((r) => deriveReservationStatus(r) === query.status)
        : res.list
      total.value = res.total
    }
  } catch (e) {
    if (current === version) loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (current === version) loading.value = false
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

/* 空态「清除筛选」：重置 Tab/空间/日期后重新加载 */
function onReset() {
  query.status = ''
  query.spaceId = ''
  query.date = ''
  query.page = 1
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

/* 管理端取消（待审核/已通过） */
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

/* 归档已结束/已驳回/已取消预约：移入归档管理，可恢复 */
async function onArchive(row: SpaceReservation) {
  acting.value = row.id + ':archive'
  try {
    await archiveReservation(row.id)
    MessagePlugin.success('预约已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：按当前空间/日期筛选全量拉取，归档所选派生状态的已结束 / 已驳回 / 已取消预约 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
const bulkStatuses = [
  { label: '已结束', value: 'ended' },
  { label: '已驳回', value: 'rejected' },
  { label: '已取消', value: 'cancelled' },
]

async function doBulkArchive(values: string[]) {
  const targets: SpaceReservation[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetchReservations({ page, pageSize: 100, spaceId: query.spaceId, date: query.date })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
  }
  const pending = targets.filter((r) => values.includes(deriveReservationStatus(r)))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档预约')
    return
  }
  let failed = 0
  for (const r of pending) {
    try {
      await archiveReservation(r.id)
    } catch {
      failed++
    }
  }
  if (pending.length - failed > 0) MessagePlugin.success(`已归档 ${pending.length - failed} 条预约`)
  if (failed > 0) MessagePlugin.warning(`${failed} 条预约归档失败，请重试`)
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

const { syncQuery } = useListQueryState(query, load)

onMounted(() => {
  loadSpaces()
  load()
})
</script>

<template>
  <div class="reservation-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="公共空间预约" description="空间预约的审核处理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="reservations"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
      </template>
    </PageHeader>

    <div class="tabs-row">
      <t-tabs :value="query.status" class="status-tabs" @change="onStatusChange">
        <t-tab-panel value="" label="全部" />
        <t-tab-panel value="pending" label="待审核" />
        <t-tab-panel value="approved" label="待使用" />
        <t-tab-panel value="using" label="使用中" />
        <t-tab-panel value="ended" label="已结束" />
        <t-tab-panel value="rejected" label="已驳回" />
        <t-tab-panel value="cancelled" label="已取消" />
      </t-tabs>
    </div>

    <!-- 筛选条与内容卡片分离，与租赁管理/投稿内容等列表页同结构 -->
    <div class="page-filter-bar">
      <t-select
        v-model="query.spaceId"
        label="空间"
        :options="spaceOptions"
        clearable
        class="ctl-w-md"
        @change="onSpaceChange"
      />
      <t-date-picker
        v-model="query.date"
        label="日期"
        valueType="YYYY-MM-DD"
        clearable
        placeholder="按预约日期筛选…"
        class="ctl-w-lg"
        @change="onDateChange"
      />
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
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @row-click="({ row }: { row: SpaceReservation }) => openDetail(row)"
      >
        <template #user="{ row }">
          <div class="user-cell">
            <span class="user-name">{{ row.userName }}</span>
            <t-tag class="id-tag-block" size="small" variant="light">{{ row.userId }}</t-tag>
            <span class="user-phone">{{ row.phone || '—' }}</span>
          </div>
        </template>
        <template #slot="{ row }">
          {{ row.date }} {{ row.startTime }} ~ {{ row.endTime }}
        </template>
        <template #status="{ row }">
          <StatusTag entity="reservation" :value="deriveReservationStatus(row)" />
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
            <t-popconfirm
              v-if="row.status === 'pending' || row.status === 'approved'"
              content="确认取消该预约？"
              @confirm="onCancel(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id">取消</t-button>
            </t-popconfirm>
            <t-popconfirm
              v-if="['ended', 'rejected', 'cancelled'].includes(deriveReservationStatus(row))"
              content="确认归档该预约？归档后可在归档管理中恢复"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':archive'">
                归档
              </t-button>
            </t-popconfirm>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" :ignore="['status']" description="暂无预约" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 预约详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="预约详情" size="560px" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <StatusTag entity="reservation" :value="deriveReservationStatus(current)" />
        </div>

        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="预约人">{{ current.userName }}<t-tag class="id-tag" size="small" variant="light">{{ current.userId }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ current.phone }}</t-descriptions-item>
          <t-descriptions-item label="空间">{{ current.spaceName }}</t-descriptions-item>
          <t-descriptions-item label="人数">{{ current.attendees }}</t-descriptions-item>
          <t-descriptions-item label="日期">{{ current.date }}</t-descriptions-item>
          <t-descriptions-item label="时段">{{ current.startTime }} ~ {{ current.endTime }}</t-descriptions-item>
        </t-descriptions>

        <p class="drawer-summary">{{ current.purpose }}</p>
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

    <!-- 审核意见抽屉 -->
    <t-drawer
      v-model:visible="dialogVisible"
      :header="dialogAction === 'approve' ? '通过预约' : '驳回预约'"
      size="560px"
      :footer="false"
      :close-btn="true"
      :close-on-esc-keydown="true"
    >
      <p v-if="dialogAction === 'approve'" class="dialog-tip">
        通过前系统将自动校验时段冲突（已通过预约与社区活动占用）。
      </p>
      <t-textarea
        v-model="comment"
        placeholder="审核意见（驳回时建议填写原因）…"
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
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
      title="一键归档 · 预约"
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
  flex-wrap: wrap;
  gap: 8px 12px;
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
