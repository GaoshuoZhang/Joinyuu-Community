<script setup lang="ts">
import { collectAllPages, executeBulk } from '@/utils/bulkOperation'
import RowMoreActions from '@/components/RowMoreActions.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, ChevronDownIcon, SearchIcon, ViewListIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ColumnController from '@/components/ColumnController.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import EventFormDialog from '@/components/EventFormDialog.vue'
import DictEntriesDialog from '@/components/DictEntriesDialog.vue'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { fetchPointsRules } from '@/api/mall'
import { statusLabel } from '@/utils/exportCsv'
import EventScheduleDialog from '@/components/EventScheduleDialog.vue'
import { archiveEvent, cancelEvent, cancelEventSchedule, fetchEvents, publishEventNow, setEventEnrollment, restoreCancelledEvent, type EventQuery } from '@/api/events'
import { fetchUser } from '@/api/users'
import { userIdentitySummary, userSubjectLabel } from '@/utils/subjectLabel'
import type { CommunityEvent } from '@/types'

const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<CommunityEvent[]>([])
const total = ref(0)
/* 当前执行中的行操作标识：`${id}:publish-now | cancel | cancel-schedule | enrollment | restore | archive` */
const acting = ref('')
/* 用户详情「数据概览」跳转带入的报名人筛选 */
const participantName = ref('')

/* 活动类型维护弹窗（原「数据字典 > 活动类型」入口；label 即业务存储值，故仅支持新增/启停/删除） */
const typeDialogVisible = ref(false)

/* 活动类型选项来自数据字典，加载失败回退默认词表 */
const typeOptions = ref([{ label: '全部', value: '' }, ...dictFallback.event_type.map((t) => ({ label: t, value: t }))])

/* 状态勾选式筛选（与需求管理同一形态）：5 个可选状态（不含「全部」项）；
 * 默认勾选「待发布 / 定时发布中 / 已发布」，即列表默认不展示「已结束 / 已取消」；
 * 全部取消勾选 = 不按状态过滤（显示全部） */
const statusCheckOptions = [
  { label: '待发布', value: 'pending_release' },
  { label: '定时发布中', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已结束', value: 'ended' },
  { label: '已取消', value: 'cancelled' },
]
const DEFAULT_STATUSES = ['pending_release', 'scheduled', 'published']
const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  type: '',
  /* 勾选式状态筛选：数组（useListQueryState 以重复 query 参数同步）；空串占位 = 不按状态过滤 */
  status: [...DEFAULT_STATUSES] as string[],
  participant: '',
})

/* 状态勾选面板（同需求管理）：勾选即查询；ESC 关闭（t-popup 仅 trigger=focus 内置 ESC 处理） */
const statusPanelVisible = ref(false)
const checkedStatusCount = computed(() => query.status.filter(Boolean).length)

function onStatusPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && statusPanelVisible.value) statusPanelVisible.value = false
}
onMounted(() => window.addEventListener('keydown', onStatusPanelKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onStatusPanelKeydown))

/* 空选 = 不按状态过滤：用单元素空串占位 —— 空数组会被 vue-router 从 URL 中丢弃 */
function onStatusChange(value: (string | number)[]) {
  const picked = value.map(String).filter(Boolean)
  query.status = picked.length ? picked : ['']
  onSearch()
}

function selectAllStatuses() {
  query.status = statusCheckOptions.map((o) => o.value)
  onSearch()
}

function clearAllStatuses() {
  query.status = ['']
  onSearch()
}

/* 排序：默认 ID 倒序（最新在前），支持计划开始时间正/倒序 */
const sortBy = ref<'id' | 'startTime' | 'createdAt'>('id')
const sortOrder = ref<'ascend' | 'descend'>('descend')

/* 活动类型标签分色（TDesign 语义色，五种类型互不相同；未命中回落 default） */
const EVENT_TYPE_THEME: Record<string, 'primary' | 'warning' | 'success' | 'danger' | 'default'> = {
  沙龙: 'primary',
  培训: 'warning',
  路演: 'success',
  社交: 'danger',
  赛事: 'default',
}
function eventTypeTheme(type: string): 'primary' | 'warning' | 'success' | 'danger' | 'default' {
  return EVENT_TYPE_THEME[type] ?? 'default'
}

const columns = [
  { colKey: 'title', fixed: 'left' as const, title: '活动', cell: 'title', width: 220, resizable: true , ellipsis: true},
  {
    colKey: 'startTime',
    title: '计划开始/结束时间',
    cell: 'startTime',
    ellipsis: true,
    width: 170,
    resizable: true,
    sorter: true,
    sortType: 'all',
  },
  { colKey: 'location', title: '地点', ellipsis: true, width: 130, resizable: true },
  { colKey: 'enrolled', title: '报名', cell: 'enrolled', width: 150, resizable: true , ellipsis: true},
  { colKey: 'checked', title: '签到', cell: 'checked', width: 150, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 150, resizable: true , ellipsis: true},
  { colKey: 'op', fixed: 'right' as const, title: '操作', cell: 'op', width: 180 },
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
    const res = await fetchEvents({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
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

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（仅「计划开始/结束时间」列可排） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'startTime') return
  sortBy.value = 'startTime'
  sortOrder.value = sort.descending ? 'descend' : 'ascend'
  query.page = 1
  load()
}

const tableSort = computed(() => ({
  sortBy: sortBy.value,
  descending: sortOrder.value === 'descend',
}))

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.type = ''
  query.status = [...DEFAULT_STATUSES]
  query.participant = ''
  participantName.value = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function goDetail(row: CommunityEvent) {
  router.push(`/events/${row.id}`)
}

function onRowClick({ row }: { row: CommunityEvent }) {
  goDetail(row)
}

/* 积分规则默认分值：活动未自定义时展示规则配置值 */
const rulePoints = ref({ enroll: 5, checkin: 10 })

/* 积分标签配色：等于积分规则默认值 = 绿色（沿用规则值）、自定义值 = 黄色 */
function enrollPointsTheme(row: CommunityEvent): 'success' | 'warning' {
  return (row.enrollPoints ?? rulePoints.value.enroll) === rulePoints.value.enroll ? 'success' : 'warning'
}
function checkinPointsTheme(row: CommunityEvent): 'success' | 'warning' {
  return (row.checkinPoints ?? rulePoints.value.checkin) === rulePoints.value.checkin ? 'success' : 'warning'
}

/* 积分文字线索：颜色不构成唯一语义，标签内补充来源（沿用积分规则默认值 / 活动自定义） */
function pointsNote(value: number | undefined, ruleValue: number): string {
  return (value ?? ruleValue) === ruleValue ? '规则值' : '自定义'
}

function approvedCount(row: CommunityEvent) {
  return row.enrollments.filter((e) => e.status === 'approved').length
}

function checkedCount(row: CommunityEvent) {
  return row.enrollments.filter((e) => e.checkedIn).length
}

function isActing(row: CommunityEvent, action: 'publish-now' | 'cancel' | 'cancel-schedule' | 'enrollment' | 'restore' | 'archive') {
  return acting.value === `${row.id}:${action}`
}

/* 已结束 / 已取消 → 归档（可在归档管理中恢复） */
async function onArchive(row: CommunityEvent) {
  acting.value = `${row.id}:archive`
  try {
    await archiveEvent(row.id)
    MessagePlugin.success('活动已归档')
    await reloadAfterRemove()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：按当前筛选全量拉取，归档所选状态的已结束 / 已取消活动 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
/* 一键归档范围快照（状态被排除，见 onBulkArchive） */
let bulkScope: EventQuery = { ...query }
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
const bulkStatuses = [
  { label: '已结束', value: 'ended' },
  { label: '已取消', value: 'cancelled' },
]

function onBulkCancel() {
  bulkCancelled = true
}

async function doBulkArchive(values: string[]) {
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: 0, failed: 0 }
  try {
    const targets = await collectAllPages<CommunityEvent>(
      (page, pageSize) => fetchEvents({ ...bulkScope, page, pageSize }), () => bulkCancelled,
    )
    const pending = targets.filter((row) => values.includes(row.status))
    if (!pending.length) {
      MessagePlugin.info(bulkCancelled ? '已取消，未执行归档' : '当前筛选范围内没有符合所选状态的记录')
      return
    }
    const result = await executeBulk(pending, (row) => archiveEvent(row.id), () => bulkCancelled,
      (progress) => { bulkProgress.value = progress })
    if (bulkCancelled) MessagePlugin.warning(`已取消，本次已归档 ${result.done - result.failed} 条活动`)
    else if (result.done > result.failed) MessagePlugin.success(`已归档 ${result.done - result.failed} 条活动`)
    if (result.failed) MessagePlugin.warning(`${result.failed} 条归档失败，请刷新后重试`)
    await load()
  } finally {
    bulkProgress.value = null
  }
}

/* 确认前预估影响条数：按所选状态取 total 求和（pageSize=1 仅取 total）；
 * 当前列表状态筛选（勾选式数组；全不选为空串占位=不筛选）不含该状态时预估为 0 */
function countByStatus(status: string) {
  const scopeStatus = bulkScope.status
  const activeStatuses = (Array.isArray(scopeStatus) ? scopeStatus : [scopeStatus]).filter(Boolean)
  if (activeStatuses.length > 0 && !activeStatuses.includes(status)) return Promise.resolve(0)
  return fetchEvents({ ...bulkScope, status, page: 1, pageSize: 1 }).then((result) => result.total)
}

function onBulkArchive() {
  /* 一键归档范围不含状态筛选（同需求列表口径）：默认状态集已隐藏「已结束/已取消」，
   * 若把状态带入范围，两个可归档状态恒为 0 条，归档入口失效 */
  bulkScope = { ...query, status: '' }
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

/* 已取消 → 转为待发布 */
async function onRestore(row: CommunityEvent) {
  acting.value = `${row.id}:restore`
  try {
    await restoreCancelledEvent(row.id)
    MessagePlugin.success('活动已转为待发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 待发布 → 立即发布（开放报名） */
async function onPublishNow(row: CommunityEvent) {
  acting.value = `${row.id}:publish-now`
  try {
    await publishEventNow(row.id)
    MessagePlugin.success('活动已发布，开放报名')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 定时发布中 → 取消定时发布，转回待发布 */
async function onCancelSchedule(row: CommunityEvent) {
  acting.value = `${row.id}:cancel-schedule`
  try {
    await cancelEventSchedule(row.id)
    MessagePlugin.success('已取消定时发布，活动转入待发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已发布 → 暂停报名 / 开放报名 */
async function onToggleEnrollment(row: CommunityEvent) {
  acting.value = `${row.id}:enrollment`
  const wasOpen = row.enrollmentOpen
  try {
    await setEventEnrollment(row.id, !wasOpen)
    MessagePlugin.success(wasOpen ? '已暂停报名' : '已开放报名')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 待发布 / 已发布 → 取消活动 */
async function onCancel(row: CommunityEvent) {
  acting.value = `${row.id}:cancel`
  try {
    await cancelEvent(row.id)
    MessagePlugin.success('活动已取消')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 新增 / 编辑活动 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentEvent = ref<CommunityEvent | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentEvent.value = null
  formVisible.value = true
}

function openEdit(row: CommunityEvent) {
  formMode.value = 'edit'
  currentEvent.value = row
  formVisible.value = true
}

/* 待发布 → 定时发布对话框 */
const scheduleVisible = ref(false)

function openSchedule(row: CommunityEvent) {
  currentEvent.value = row
  scheduleVisible.value = true
}

/* 用户详情「数据概览」跳转带入报名人 ID（query: participant），按 ID 过滤避免同名歧义；
 * 筛选标签姓名经 fetchUser 解析展示 */
async function applyRouteFilter() {
  participantName.value = ''
  if (query.participant) {
    try {
      const u = await fetchUser(query.participant)
      participantName.value = userSubjectLabel({ realName: u.realName, nickname: u.nickname, uid: u.uid, identity: userIdentitySummary(u) })
    } catch {
      /* 用户不存在时标签回退显示 ID */
    }
  }
}

function clearParticipant() {
  query.participant = ''
  participantName.value = ''
  query.page = 1
  load()
}

watch(() => query.participant, applyRouteFilter)

const { syncQuery } = useListQueryState(query, load, { refs: { sortBy, sortOrder } })

onMounted(() => {
  applyRouteFilter()
  load()
  /* 积分规则默认值取自真实规则（标签配色依赖它，与需求列表同一思路） */
  fetchPointsRules()
    .then((rules) => {
      rulePoints.value.enroll = rules.find((r) => r.code === 'activity_enroll_approved')?.points ?? 5
      rulePoints.value.checkin = rules.find((r) => r.code === 'activity_checkin')?.points ?? 10
    })
    .catch(() => {
      /* 规则加载失败保留默认值 */
    })
  void loadEventTypes()
})

/* 活动类型下拉（含「活动类型」弹窗保存后的刷新；原「数据字典 > 活动类型」入口迁移至此）：
 * 该页类型的 value 与存储值一致（均为 label），故 value 取 label */
async function loadEventTypes() {
  try {
    const entries = await fetchDictEntries('event_type')
    const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
    if (labels.length) typeOptions.value = [{ label: '全部', value: '' }, ...labels]
  } catch {
    /* 字典加载失败保留回退词表 */
  }
}

/* 导出：当前页 / 全部结果（沿用列表筛选） */
const exportHeaders = ['编号', '活动标题', '类型', '开始时间', '结束时间', '地点', '报名（已通过/容量）', '状态']

function mapRow(e: CommunityEvent): (string | number)[] {
  return [
    e.id,
    e.title,
    e.type,
    e.startTime,
    e.endTime,
    e.location,
    `${e.enrollments.filter((en) => en.status === 'approved').length}/${e.capacity}`,
    statusLabel('event', e.status),
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchEvents({ ...query, page, pageSize })
}
</script>

<template>
  <div class="event-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="活动管理" description="社区活动的新增、发布、报名与签到管理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="events"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" @click="typeDialogVisible = true">
          <template #icon><ViewListIcon /></template>
          活动类型
        </t-button>
        <t-button variant="outline" :loading="archivingAll" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
        <ExportButton
          filename="活动列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增活动
        </t-button>
      </template>
    </PageHeader>

    <DictEntriesDialog v-model:visible="typeDialogVisible" type="event_type" title="活动类型" @success="loadEventTypes" />

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索活动标题/编号'" class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索活动标题/编号…"
        clearable
        @enter="onSearch"
      />
      <t-select v-accessible-field="'类型'" class="ctl-w-md"
        v-model="query.type"
        label="类型"
        :options="typeOptions"
        clearable
        @change="onSearch"
      />
      <!-- 状态：勾选式多选（默认勾选 3 项，全部取消 = 不按状态过滤）；勾选即查询 -->
      <t-popup
        v-model:visible="statusPanelVisible"
        trigger="click"
        placement="bottom-left"
        :show-arrow="false"
        overlay-class-name="status-filter-popup"
        overlay-inner-class-name="status-filter-popup-inner"
      >
        <t-button variant="outline" :aria-label="`状态筛选，已勾选 ${checkedStatusCount} 项`">
          状态<template v-if="checkedStatusCount">（{{ checkedStatusCount }}）</template>
          <template #suffix><ChevronDownIcon /></template>
        </t-button>
        <template #content>
          <div class="status-panel">
            <div class="status-panel-head">
              <span class="status-panel-title">状态</span>
              <div class="status-panel-tools">
                <t-button
                  variant="text"
                  size="small"
                  :disabled="checkedStatusCount === statusCheckOptions.length"
                  @click="selectAllStatuses"
                >
                  全选
                </t-button>
                <t-button variant="text" size="small" :disabled="checkedStatusCount === 0" @click="clearAllStatuses">
                  清空
                </t-button>
              </div>
            </div>
            <t-checkbox-group :value="query.status" :options="statusCheckOptions" @change="onStatusChange" />
          </div>
        </template>
      </t-popup>
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        重置
      </t-button>
      <t-tag
        v-if="query.participant"
        closable
        variant="light"
        theme="primary"
        @close="clearParticipant"
      >
        报名人：{{ participantName || query.participant }}
      </t-tag>
    </div>

    <div class="page-card">
      <t-table :horizontal-scroll-affixed-bottom="{ container: '.page-scroll', offsetBottom: 0 }"
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        @row-click="onRowClick"
      >
        <template #title="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <div class="cell-sub">
            <t-tag variant="light" size="small" :theme="eventTypeTheme(row.type)">{{ row.type }}</t-tag>
            <span class="cell-id">{{ row.id }}</span>
          </div>
        </template>
        <template #startTime="{ row }">
          <div class="stack-cell">
            <span>{{ row.startTime || '—' }}</span>
            <span class="cell-end">{{ row.endTime || '—' }}</span>
          </div>
        </template>
        <template #enrolled="{ row }">
          <div class="stack-cell">
            <span>{{ approvedCount(row) }}/{{ row.capacity }}</span>
            <!-- 标签色区分来源（绿色=沿用积分规则值，黄色=活动自定义值），文字线索同步给出 -->
            <t-tag :theme="enrollPointsTheme(row)" variant="light" size="small">
              {{ row.enrollPoints ?? rulePoints.enroll }}积分 · {{ pointsNote(row.enrollPoints, rulePoints.enroll) }}
            </t-tag>
          </div>
        </template>
        <template #checked="{ row }">
          <div class="stack-cell">
            <span>{{ checkedCount(row) }}/{{ approvedCount(row) }}</span>
            <t-tag :theme="checkinPointsTheme(row)" variant="light" size="small">
              {{ row.checkinPoints ?? rulePoints.checkin }}积分 · {{ pointsNote(row.checkinPoints, rulePoints.checkin) }}
            </t-tag>
          </div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="event" :value="row.status" :scheduled-at="row.scheduledAt" :enrollment-open="row.enrollmentOpen" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 详情：形态与行点击一致，为键盘用户提供显式入口 -->
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
            <t-button v-if="['pending_release', 'published'].includes(row.status)" variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <RowMoreActions v-if="['pending_release', 'cancelled', 'scheduled', 'published', 'ended'].includes(row.status)">
            <!-- 待发布：编辑 / 立即发布 / 定时发布 / 取消活动 -->
            <template v-if="row.status === 'pending_release'">

              <t-popconfirm content="确认立即发布该活动？发布后成员即可报名" @confirm="onPublishNow(row)">
                <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'publish-now')">
                  立即发布
                </t-button>
              </t-popconfirm>
              <t-button variant="text" size="small" @click="openSchedule(row)">定时发布</t-button>
              <t-popconfirm content="确认取消该活动？取消后可转为待发布，已报名成员将收到通知" @confirm="onCancel(row)">
                <t-button variant="text" size="small" theme="danger" :loading="isActing(row, 'cancel')">取消活动</t-button>
              </t-popconfirm>
            </template>

            <!-- 已取消：转为待发布 -->
            <t-popconfirm
              v-if="row.status === 'cancelled'"
              content="确认将该活动转为「待发布」？"
              @confirm="onRestore(row)"
            >
              <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'restore')">
                转为待发布
              </t-button>
            </t-popconfirm>

            <!-- 定时发布中：取消定时发布（状态标签直接显示定时发布时间） -->
            <t-popconfirm
              v-if="row.status === 'scheduled'"
              content="确认取消定时发布？该活动将转为「待发布」"
              @confirm="onCancelSchedule(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="isActing(row, 'cancel-schedule')">
                取消定时发布
              </t-button>
            </t-popconfirm>

            <!-- 已发布：编辑 / 暂停报名 / 开放报名、取消活动 -->
            <template v-if="row.status === 'published'">

              <!-- 暂停报名影响全部成员报名需确认；开放报名为恢复性操作直接执行 -->
              <t-popconfirm
                v-if="row.enrollmentOpen"
                content="确认暂停报名？暂停后成员将无法报名"
                confirm-btn="暂停报名"
                @confirm="onToggleEnrollment(row)"
              >
                <t-button variant="text" size="small" :loading="isActing(row, 'enrollment')">暂停报名</t-button>
              </t-popconfirm>
              <t-button
                v-else
                variant="text"
                size="small"
                :loading="isActing(row, 'enrollment')"
                @click="onToggleEnrollment(row)"
              >
                开放报名
              </t-button>
              <t-popconfirm content="确认取消该活动？取消后可转为待发布，已报名成员将收到通知" @confirm="onCancel(row)">
                <t-button variant="text" size="small" theme="danger" :loading="isActing(row, 'cancel')">取消活动</t-button>
              </t-popconfirm>
            </template>

            <!-- 已结束 / 已取消：归档（可在归档管理中恢复） -->
            <t-popconfirm
              v-if="row.status === 'ended' || row.status === 'cancelled'"
              content="确认归档该活动？归档后可在归档管理中恢复"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="isActing(row, 'archive')">归档</t-button>
            </t-popconfirm>
            </RowMoreActions>
          </div>
        </template>
        <template #empty>
          <ListEmptyState :query="query" description="暂无活动数据" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 新增 / 编辑活动弹窗 -->
    <EventFormDialog v-model:visible="formVisible" :mode="formMode" :event="currentEvent" @success="load" />

    <!-- 待发布：定时发布对话框 -->
    <EventScheduleDialog v-model:visible="scheduleVisible" :event="currentEvent" @success="load" />

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 活动"
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
.cell-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 标题区第二行：类型标签在活动编号左边（列 ellipsis 由标题行承载） */
.cell-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  min-width: 0;
}

.cell-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* 计划开始/结束时间：两行同为 14px 时间戳，次行用次级色区分层次（与需求/项目列表口径一致） */
.cell-end {
  color: var(--td-text-color-secondary);
}

.stack-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

/* ---------- 状态勾选面板（浮层挂载到 body，scoped 选择器无法命中，故用 :global 收窄到本页唯一类名） ---------- */
:global(.status-filter-popup) {
  padding: 0;
}

:global(.status-filter-popup-inner) {
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.status-panel {
  width: 180px;
  padding: 8px 12px 12px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-2);
}

.status-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.status-panel-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-panel :deep(.t-checkbox-group) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
