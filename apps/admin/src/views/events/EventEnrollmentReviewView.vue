<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin, type FormProps } from 'tdesign-vue-next'
import { SearchIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ColumnController from '@/components/ColumnController.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { statusLabel } from '@/utils/exportCsv'
import { fetchEventEnrollments, reviewEventEnrollment } from '@/api/events'
import type { EventEnrollmentRecord, UserIdentity } from '@/types'

/* 活动报名审核：跨活动汇总报名记录，按状态筛选后通过 / 驳回；行点击进入活动详情的报名管理 */
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<EventEnrollmentRecord[]>([])
const total = ref(0)
const reviewing = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: 'pending',
})

const statusTabs = [
  { value: 'pending', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'waitlisted', label: '候补中' },
  { value: 'cancelled', label: '已取消' },
  { value: '', label: '全部' },
]

const columns = [
  { colKey: 'event', title: '活动', cell: 'event', width: 220, resizable: true, ellipsis: true },
  { colKey: 'name', title: '报名人', cell: 'name', width: 150, resizable: true, ellipsis: true },
  { colKey: 'identities', title: '关联身份', cell: 'identities', width: 240, resizable: true, ellipsis: true },
  { colKey: 'phone', title: '联系电话', cell: 'phone', width: 130, resizable: true, ellipsis: true },
  { colKey: 'appliedAt', title: '报名时间', width: 150, resizable: true, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
  { colKey: 'waitlistOrder', title: '候补顺序', cell: 'waitlistOrder', width: 100, resizable: true, ellipsis: true },
  { colKey: 'checkedIn', title: '签到', cell: 'checkedIn', width: 90, resizable: true, ellipsis: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 150 },
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
    const res = await fetchEventEnrollments({ ...query })
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
  query.status = ''
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

function goEvent(row: EventEnrollmentRecord) {
  router.push({ path: `/events/${row.eventId}`, query: { tab: 'enrollments' } })
}

function relatedIdentities(row: EventEnrollmentRecord): UserIdentity[] {
  return row.identities.filter((identity) => identity.type !== 'individual')
}

function identityText(identity: UserIdentity): string {
  if (identity.type === 'community_individual') return '社区个体'
  if (identity.type === 'community_enterprise') {
    return `${identity.enterpriseName || '社区企业'}${identity.enterpriseId ? ` [${identity.enterpriseId}]` : ''}${identity.title ? ` · ${identity.title}` : ''}`
  }
  if (identity.type === 'external_enterprise') {
    return `${identity.enterpriseName || '合作企业'}${identity.title ? ` · ${identity.title}` : ''}`
  }
  return '个人用户'
}

function onRowClick({ row }: { row: EventEnrollmentRecord }) {
  goEvent(row)
}

function isReviewing(row: EventEnrollmentRecord, status: 'approved' | 'rejected') {
  return reviewing.value === `${row.eventId}:${row.userId}:${status}`
}

async function onReview(row: EventEnrollmentRecord, status: 'approved') {
  reviewing.value = `${row.eventId}:${row.userId}:approved`
  try {
    await reviewEventEnrollment(row.eventId, row.userId, status)
    MessagePlugin.success('已通过该报名')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    reviewing.value = ''
  }
}

/* 驳回必填原因（与申请审核一致）：弹窗填写后提交，原因随站内通知下发申请人并记入审计 */
const rejectVisible = ref(false)
const rejectRow = ref<EventEnrollmentRecord | null>(null)
const rejectFormRef = ref()
const rejectForm = reactive({ reason: '' })
const rejectSubmitting = ref(false)
const rejectRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写驳回原因', trigger: 'submit' }],
}

function openReject(row: EventEnrollmentRecord) {
  rejectRow.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
  nextTick(() => rejectFormRef.value?.clearValidate())
}

async function onConfirmReject() {
  const row = rejectRow.value
  if (!row) return
  const valid = await rejectFormRef.value.validate()
  if (valid !== true) return
  rejectSubmitting.value = true
  try {
    await reviewEventEnrollment(row.eventId, row.userId, 'rejected', rejectForm.reason)
    MessagePlugin.success('已驳回该报名')
    rejectVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    rejectSubmitting.value = false
  }
}

/* 导出：当前页 / 全部结果（沿用列表筛选） */
const exportHeaders = [
  '活动编号', '活动标题', '报名人', '用户ID', '关联身份', '联系电话', '报名时间', '状态', '候补顺序', '签到',
]

function mapRow(e: EventEnrollmentRecord): (string | number)[] {
  return [
    e.eventId,
    e.eventTitle,
    e.name,
    e.userId,
    relatedIdentities(e).map(identityText).join('、') || '—',
    e.phone || '—',
    e.appliedAt,
    statusLabel('enrollment', e.status),
    e.waitlistOrder ?? '—',
    e.checkedIn ? '已签到' : '未签到',
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchEventEnrollments({ ...query, page, pageSize })
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="event-enrollments page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <PageHeader title="活动报名" description="汇总各活动报名记录，按状态审核通过或驳回">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="event-enrollments"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <ExportButton
          filename="活动报名列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
      </template>
    </PageHeader>

    <div class="page-card">
      <div class="tabs-row">
        <t-tabs :value="query.status" class="status-tabs" @change="onStatusChange">
          <t-tab-panel v-for="tab in statusTabs" :key="tab.value" :value="tab.value" :label="tab.label" />
        </t-tabs>
      </div>

      <div class="page-filter-bar">
        <t-input class="ctl-w-xl"
          v-model="query.keyword"
          placeholder="搜索报名人/身份/电话/活动…"
          clearable
          @enter="onSearch"
        />
        <t-button @click="onSearch">
          <template #icon><SearchIcon /></template>
          查询
        </t-button>
        <t-button variant="outline" @click="onReset">
          重置
        </t-button>
      </div>

      <t-table
        :row-key="(row: EventEnrollmentRecord) => `${row.eventId}:${row.userId}`"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @row-click="onRowClick"
      >
        <template #event="{ row }">
          <div class="cell-title">{{ row.eventTitle }}</div>
          <div class="cell-sub">{{ row.eventId }} · {{ row.eventStartTime }}</div>
        </template>
        <template #name="{ row }">
          <div>{{ row.name }}</div>
          <div class="cell-sub">{{ row.userId }}</div>
        </template>
        <template #identities="{ row }">
          <IdentityTags v-if="relatedIdentities(row).length" :identities="relatedIdentities(row)" />
          <span v-else class="muted-dash">—</span>
        </template>
        <template #phone="{ row }">{{ row.phone || '—' }}</template>
        <template #status="{ row }">
          <StatusTag entity="enrollment" :value="row.status" />
        </template>
        <template #waitlistOrder="{ row }">{{ row.waitlistOrder ?? '—' }}</template>
        <template #checkedIn="{ row }">
          <t-tag :theme="row.checkedIn ? 'success' : 'default'" variant="light" size="small">
            {{ row.checkedIn ? '已签到' : '未签到' }}
          </t-tag>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <template v-if="row.status === 'pending'">
              <t-popconfirm content="确认通过该报名？通过后将按规则发放报名积分" @confirm="onReview(row, 'approved')">
                <t-button variant="text" size="small" theme="primary" :loading="isReviewing(row, 'approved')">通过</t-button>
              </t-popconfirm>
              <t-button variant="text" size="small" theme="danger" @click="openReject(row)">驳回</t-button>
            </template>
            <t-button variant="text" size="small" @click="goEvent(row)">活动详情</t-button>
          </div>
        </template>
        <template #empty>
          <ListEmptyState :query="query" :ignore="['status']" description="暂无报名记录" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 驳回原因对话框：必填，原因随站内通知下发申请人并记入审计 -->
    <t-dialog
      v-model:visible="rejectVisible"
      header="驳回报名"
      width="480px"
      :close-on-overlay-click="!rejectSubmitting"
      :confirm-btn="{ content: '确认驳回', theme: 'danger', loading: rejectSubmitting }"
      cancel-btn="取消"
      @confirm="onConfirmReject"
    >
      <p class="reject-tip">
        {{ rejectRow ? `驳回 ${rejectRow.name} 对「${rejectRow.eventTitle}」的报名` : '' }}原因将通过站内通知告知申请人。
      </p>
      <t-form ref="rejectFormRef" :data="rejectForm" :rules="rejectRules">
        <t-form-item name="reason">
          <t-textarea
            v-model="rejectForm.reason"
            :maxlength="200"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请填写驳回原因（必填，将通知申请人）…"
          />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.reject-tip {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

.tabs-row {
  margin-bottom: 16px;
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}
</style>
