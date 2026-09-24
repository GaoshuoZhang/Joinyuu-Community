<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, SearchIcon, ViewListIcon } from 'tdesign-icons-vue-next'
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
import { archiveEvent, cancelEvent, cancelEventSchedule, fetchEvents, publishEventNow, setEventEnrollment, restoreCancelledEvent } from '@/api/events'
import { fetchUser } from '@/api/users'
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

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  type: '',
  status: '',
  participant: '',
})

/* 活动类型维护弹窗（原「数据字典 > 活动类型」入口；label 即业务存储值，故仅支持新增/启停/删除） */
const typeDialogVisible = ref(false)

/* 活动类型选项来自数据字典，加载失败回退默认词表 */
const typeOptions = ref([{ label: '全部', value: '' }, ...dictFallback.event_type.map((t) => ({ label: t, value: t }))])

const statusOptions = [
  { label: '全部', value: '' },
  { label: '待发布', value: 'pending_release' },
  { label: '定时发布中', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已结束', value: 'ended' },
  { label: '已取消', value: 'cancelled' },
]

/* 排序：默认 ID 倒序（最新在前），支持开始时间/创建时间正/倒序 */
const sortBy = ref<'id' | 'startTime' | 'createdAt'>('id')
const sortOrder = ref<'ascend' | 'descend'>('descend')

const columns = [
  { colKey: 'title', title: '活动', cell: 'title', width: 220, resizable: true , ellipsis: true},
  { colKey: 'type', title: '类型', cell: 'type', width: 84, resizable: true , ellipsis: true},
  {
    colKey: 'startTime',
    title: '活动开始时间',
    cell: 'startTime',
    ellipsis: true,
    width: 170,
    resizable: true,
    sorter: true,
    sortType: 'all',
  },
  {
    colKey: 'createdAt',
    title: '创建时间',
    cell: 'createdAt',
    width: 170,
    resizable: true,
    sorter: true,
    sortType: 'all',
  ellipsis: true,
  },
  { colKey: 'location', title: '地点', ellipsis: true, width: 130, resizable: true },
  { colKey: 'enrolled', title: '报名', cell: 'enrolled', width: 108, resizable: true , ellipsis: true},
  { colKey: 'checked', title: '签到', cell: 'checked', width: 108, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 150, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 300 },
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

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'startTime' && sort.sortBy !== 'createdAt') return
  sortBy.value = sort.sortBy as 'startTime' | 'createdAt'
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
  query.status = ''
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
  const targets: CommunityEvent[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetchEvents({ ...query, page, pageSize: 100 })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
  }
  const pending = targets.filter((e) => values.includes(e.status))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档活动')
    return
  }
  /* 进度 + 可取消：逐条执行，取消后停止后续条目（见 BulkArchiveDialog 进度态） */
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: pending.length, failed: 0 }
  let done = 0
  let failed = 0
  for (const e of pending) {
    if (bulkCancelled) break
    try {
      await archiveEvent(e.id)
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
    if (done - failed > 0) MessagePlugin.success(`已归档 ${done - failed} 条活动`)
    if (failed > 0) MessagePlugin.warning(`${failed} 条活动归档失败，请重试`)
  }
  await load()
}

/* 确认前预估影响条数：按所选状态取 total 求和（pageSize=1 仅取 total） */
function countByStatus(status: string) {
  return fetchEvents({ ...query, status, page: 1, pageSize: 1 }).then((r) => r.total)
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
      participantName.value = u.nickname
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
      <t-input class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索活动标题/编号…"
        clearable
        @enter="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.type"
        label="类型"
        :options="typeOptions"
        clearable
        @change="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        @change="onSearch"
      />
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
      <t-table
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
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #type="{ row }">
          <t-tag variant="light">{{ row.type }}</t-tag>
        </template>
        <template #startTime="{ row }">{{ row.startTime || '—' }}</template>
        <template #createdAt="{ row }">{{ row.createdAt ?? '—' }}</template>
        <template #enrolled="{ row }">
          <div class="stack-cell">
            <span>{{ approvedCount(row) }}/{{ row.capacity }}</span>
            <!-- 只标数值：标签色区分来源（绿色=沿用积分规则值，黄色=活动自定义值） -->
            <t-tag :theme="enrollPointsTheme(row)" variant="light" size="small">
              {{ row.enrollPoints ?? rulePoints.enroll }}积分
            </t-tag>
          </div>
        </template>
        <template #checked="{ row }">
          <div class="stack-cell">
            <span>{{ checkedCount(row) }}/{{ approvedCount(row) }}</span>
            <t-tag :theme="checkinPointsTheme(row)" variant="light" size="small">
              {{ row.checkinPoints ?? rulePoints.checkin }}积分
            </t-tag>
          </div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="event" :value="row.status" :scheduled-at="row.scheduledAt" :enrollment-open="row.enrollmentOpen" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 待发布：编辑 / 立即发布 / 定时发布 / 取消活动 -->
            <template v-if="row.status === 'pending_release'">
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-popconfirm content="确认立即发布该活动？发布后成员即可报名" @confirm="onPublishNow(row)">
                <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'publish-now')">
                  立即发布
                </t-button>
              </t-popconfirm>
              <t-button variant="text" size="small" @click="openSchedule(row)">定时发布</t-button>
              <t-popconfirm content="确认取消该活动？取消后不可恢复" @confirm="onCancel(row)">
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
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-button
                variant="text"
                size="small"
                :loading="isActing(row, 'enrollment')"
                @click="onToggleEnrollment(row)"
              >
                {{ row.enrollmentOpen ? '暂停报名' : '开放报名' }}
              </t-button>
              <t-popconfirm content="确认取消该活动？取消后不可恢复" @confirm="onCancel(row)">
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
.stack-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
</style>
