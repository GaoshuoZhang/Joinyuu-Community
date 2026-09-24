<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon, EditIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import SpaceFormDialog from '@/components/SpaceFormDialog.vue'
import { fetchReservations, fetchSpace, fetchSpaceEventOccupancy, setSpaceStatus, type SpaceEventOccupancy } from '@/api/spaces'
import { isNotFound } from '@/api/http'
import { spaceTypeMap, statusMap } from '@/constants/status'
import { deriveReservationStatus } from '@/utils/reservation'
import { formatMonthKey } from '@/utils/format'
import type { Space, SpaceReservation } from '@/types'

/* 空间详情页：空间信息 + Calendar 日历（cellAppend 追加当日占用详情）+ 占用明细表。
 * 占用 = 空间预约（六态）+ 已发布活动占用（口径与客户端可约时段一致，后端按日展开）。
 * 头部操作与公共空间列表 op 同步（可用：编辑/维护/停用；维护或停用：恢复可用）。 */
const route = useRoute()
const router = useRouter()

const loading = ref(false)
/* 非 404 的加载失败：展示错误与重试入口（404 仍走「不存在」空态） */
const loadError = ref('')
const space = ref<Space | null>(null)
const reservations = ref<SpaceReservation[]>([])
const eventOccupancies = ref<SpaceEventOccupancy[]>([])
const acting = ref('')
const formVisible = ref(false)
/* 已归档条目：隐藏写操作（编辑/状态变更），只读内容保留 */
const isArchived = computed(() => !!space.value?.deletedAt)

/* 占用行（预约 + 活动合并）：日历与明细列表共用同一份数据；按 source 区分字段 */
interface OccupancyBase {
  key: string
  date: string
  startTime: string
  endTime: string
  /** 预约人 / 活动主办方 */
  subject: string
  /** 预约用途 / 活动标题 */
  title: string
}

interface ReservationOccupancyRow extends OccupancyBase {
  source: 'reservation'
  /** 预约人 ID */
  subjectTag: string
  /** 预约六态派生（与 StatusTag / 列表页口径一致） */
  status: keyof typeof statusMap.reservation
}

interface EventOccupancyRow extends OccupancyBase {
  source: 'event'
}

type OccupancyRow = ReservationOccupancyRow | EventOccupancyRow

const occupancyRows = computed<OccupancyRow[]>(() => {
  const rows: OccupancyRow[] = reservations.value.map((r) => ({
    key: `r:${r.id}`,
    source: 'reservation',
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    subject: r.userName,
    subjectTag: r.userId,
    title: r.purpose,
    status: deriveReservationStatus(r),
  }))
  for (const e of eventOccupancies.value) {
    rows.push({
      key: `e:${e.eventId}:${e.date}`,
      source: 'event',
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      subject: e.host,
      title: e.title,
    })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
})

/* 占用按日期分组：日历 cellAppend 按 formattedDate 直接取数 */
const byDate = computed(() => {
  const map: Record<string, OccupancyRow[]> = {}
  for (const row of occupancyRows.value) {
    if (!map[row.date]) map[row.date] = []
    map[row.date].push(row)
  }
  return map
})

/* 日历单元格当日占用（不存在返回空数组，模板中可安全遍历） */
function occupanciesOn(formattedDate: string): OccupancyRow[] {
  return byDate.value[formattedDate] ?? []
}

/* 日历条目悬停说明：预约显示预约人/用途/状态，活动占用显示活动名/主办方 */
function occupancyTooltip(row: OccupancyRow): string {
  const slot = `${row.date} ${row.startTime} ~ ${row.endTime}`
  if (row.source === 'event') return `${slot} 社区活动「${row.title}」（${row.subject}）`
  return `${slot} ${row.subject}（${row.title}）· ${statusMap.reservation[row.status].label}`
}

const reservationModeText = computed(() =>
  space.value?.needReservation
    ? space.value.needApproval
      ? '需预约 · 需审核'
      : '需预约 · 免审核'
    : '免预约',
)

/* 页头描述：类型/位置空值过滤后以「 · 」拼接，全空显示 — */
const headerDescription = computed(() => {
  const parts = [spaceTypeMap[space.value?.type ?? 'meeting'], space.value?.location].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
})

/* 容量：空值整体显示 —（不带「人」单位） */
const capacityText = computed(() => {
  const c = space.value?.capacity
  return c != null ? `${c} 人` : '—'
})

/* 明细列：预约与活动占用共用（状态列按来源分别渲染 StatusTag / 活动占用标签） */
const detailColumns = [
  { colKey: 'subject', title: '预约人 / 主办方', cell: 'subject', width: 110 , ellipsis: true},
  { colKey: 'slot', title: '日期时段', cell: 'slot' , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 84 , ellipsis: true},
]

/* 预约日历：禁用"月/年"视图切换（controllerConfig.mode.visible=false），保留年份/月份下拉与今天按钮 */
const calendarController = { mode: { visible: false } }

/* 日历当前展示月份（controller-change 覆盖翻月/翻年/回今天），明细仅展示该月数据 */
const displayedDate = ref(new Date())

function onControllerChange(opts: { filterDate: Date }) {
  displayedDate.value = opts.filterDate
}

const monthKey = computed(() => {
  const d = displayedDate.value
  return formatMonthKey(d)
})

const monthReservations = computed(() => occupancyRows.value.filter((row) => row.date.startsWith(monthKey.value)))

const periodText = computed(() => {
  const s = space.value
  if (!s) return '—'
  return s.allDay ? '全天开放' : s.openTime && s.closeTime ? `${s.openTime} ~ ${s.closeTime}` : '—'
})

const equipmentText = computed(() =>
  space.value && space.value.equipment.length > 0 ? space.value.equipment.join('、') : '—',
)

/* 预约接口 pageSize 上限 100：首屏取第一页，其余按需追加，避免只展示前 100 条 */
const RESERVATION_PAGE_SIZE = 100
const reservationTotal = ref(0)
const reservationPage = ref(1)
const loadingMore = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const id = String(route.params.id)
    const [s, res, events] = await Promise.all([
      fetchSpace(id),
      fetchReservations({ page: 1, pageSize: RESERVATION_PAGE_SIZE, spaceId: id }),
      fetchSpaceEventOccupancy(id),
    ])
    space.value = s
    reservations.value = res.list
    eventOccupancies.value = events
    reservationTotal.value = res.total
    reservationPage.value = 1
  } catch (e) {
    space.value = null
    reservations.value = []
    eventOccupancies.value = []
    /* 404 = 空间不存在；其余错误保留具体原因并给出重试入口 */
    if (!isNotFound(e)) loadError.value = e instanceof Error ? e.message : '空间加载失败'
  } finally {
    loading.value = false
  }
}

/* 加载更多预约（追加下一页） */
async function loadMoreReservations() {
  if (loadingMore.value || reservations.value.length >= reservationTotal.value) return
  loadingMore.value = true
  try {
    const next = reservationPage.value + 1
    const res = await fetchReservations({
      page: next,
      pageSize: RESERVATION_PAGE_SIZE,
      spaceId: String(route.params.id),
    })
    reservationPage.value = next
    reservations.value = [...reservations.value, ...res.list]
    reservationTotal.value = res.total
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '预约加载失败')
  } finally {
    loadingMore.value = false
  }
}

/* 编辑空间（复用列表页弹窗：基础信息编辑，状态走独立操作） */
function openEdit() {
  if (!space.value) return
  formVisible.value = true
}

/* 维护 / 停用 / 恢复可用（同步列表页操作，确认由模板 popconfirm 承担） */
async function onSetStatus(status: Space['status']) {
  if (!space.value) return
  acting.value = status
  try {
    await setSpaceStatus(space.value.id, status)
    const text = status === 'available' ? '已恢复可用' : status === 'maintenance' ? '已登记维护' : '已停用'
    MessagePlugin.success(`空间「${space.value.name}」${text}`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="space-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="router.back()">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <PageHeader :title="space?.name ?? '空间详情'" :description="headerDescription">
      <template #actions>
        <t-tag v-if="isArchived" theme="default" variant="light">已归档</t-tag>
        <template v-if="space && !isArchived">
          <t-button variant="outline" @click="openEdit">
            <template #icon><EditIcon /></template>
            编辑
          </t-button>
          <template v-if="space.status === 'available'">
            <t-popconfirm content="确认登记维护？维护期间不可预约" @confirm="onSetStatus('maintenance')">
              <t-button variant="outline" theme="warning" :loading="acting === 'maintenance'">维护</t-button>
            </t-popconfirm>
            <t-popconfirm content="确认停用该空间？停用后不再开放预约" @confirm="onSetStatus('disabled')">
              <t-button variant="outline" theme="danger" :loading="acting === 'disabled'">停用</t-button>
            </t-popconfirm>
          </template>
          <t-button
            v-else
            variant="outline"
            theme="primary"
            :loading="acting === 'available'"
            @click="onSetStatus('available')"
          >
            恢复可用
          </t-button>
        </template>
      </template>
    </PageHeader>

    <t-loading :loading="loading" size="small">
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
      <t-empty v-else-if="!loading && !space" description="空间不存在" />
      <template v-else-if="space">
      <div class="page-card">
        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="空间类型">{{ spaceTypeMap[space?.type ?? 'meeting'] ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="容量">{{ capacityText }}</t-descriptions-item>
          <t-descriptions-item label="状态">
            <StatusTag v-if="space" entity="space" :value="space.status" />
          </t-descriptions-item>
          <t-descriptions-item label="开放时段">{{ periodText }}</t-descriptions-item>
          <t-descriptions-item label="预约方式" :span="2">
            <t-tag variant="outline" size="small">{{ reservationModeText }}</t-tag>
          </t-descriptions-item>
          <!-- 费用：积分/小时，0 = 免费使用；预约提交时按计费小时扣除（不足 1 小时按 1 小时计） -->
          <t-descriptions-item label="费用" :span="2">
            <t-tag v-if="(space?.feePerHour ?? 0) > 0" variant="light" theme="warning" size="small">
              {{ space?.feePerHour }} 积分/小时
            </t-tag>
            <t-tag v-else variant="light" theme="success" size="small">免费</t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="配备设备" :span="2">{{ equipmentText }}</t-descriptions-item>
          <t-descriptions-item label="空间说明" :span="2">{{ space?.description || '—' }}</t-descriptions-item>
        </t-descriptions>
      </div>

      <!-- 占用日历（2/3 宽）+ 当月占用明细（1/3 宽）：预约与活动占用合并展示 -->
      <div class="page-card calendar-card">
        <div class="detail-grid">
          <div class="calendar-col">
            <h4 class="card-section-title">预约日历</h4>
            <!-- cellAppend：在日历单元格原内容之后追加当日占用摘要（预约 + 活动占用）。
                 插槽作用域 = CalendarCell 本体（源码链路完整验证：calendar-cell.mjs renderContent(name, void 0, { params: cellData })
                 → useContent 包一层 { params: cellData } → useTNodeJSX 里 getParams 再拆掉包装 → handleSlots 把 cellData 本体传给插槽）。
                 因此 #cellAppend="cell" 才正确；写成 "{ cell }" 或 "{ params }" 都会让解构结果为 undefined 而崩溃
                 （每个单元格一次渲染错误，tbody 整体渲染失败 → 只剩控制器和星期表头）。勿改回解构写法。
                 belongTo === 0 表示本月日期；日期取值统一走 occupanciesOn()，不存在返回空数组 -->
            <t-calendar :controller-config="calendarController" @controller-change="onControllerChange">
              <template #cellAppend="cell">
                <template v-if="cell.belongTo === 0 && occupanciesOn(cell.formattedDate).length > 0">
                  <div
                    v-for="row in occupanciesOn(cell.formattedDate).slice(0, 3)"
                    :key="row.key"
                    class="cal-item"
                    :class="row.source === 'event' ? 'is-event' : `is-${row.status}`"
                    :title="occupancyTooltip(row)"
                  >
                    {{ row.startTime }} {{ row.source === 'event' ? row.title : row.subject }}
                  </div>
                  <div v-if="occupanciesOn(cell.formattedDate).length > 3" class="cal-more">
                    共 {{ occupanciesOn(cell.formattedDate).length }} 条占用
                  </div>
                </template>
              </template>
            </t-calendar>
            <div class="cal-legend">
              <span class="cal-legend-item is-approved"><i class="legend-dot is-approved" />待使用</span>
              <span class="cal-legend-item is-using"><i class="legend-dot is-using" />使用中</span>
              <span class="cal-legend-item is-pending"><i class="legend-dot is-pending" />待审核</span>
              <span class="cal-legend-item is-ended"><i class="legend-dot is-ended" />已结束</span>
              <span class="cal-legend-item is-muted"><i class="legend-dot is-muted" />已驳回/已取消</span>
              <span class="cal-legend-item is-event"><i class="legend-dot is-event" />活动占用</span>
            </div>
          </div>
          <div class="detail-col">
            <h4 class="card-section-title">{{ monthKey }} 占用明细（{{ monthReservations.length }}）</h4>
            <t-table
              row-key="key"
              hover
              size="small"
              :data="monthReservations"
              :columns="detailColumns"
              empty="该月暂无占用"
            >
              <template #subject="{ row }">
                <template v-if="row.source === 'reservation'">
                  {{ row.subject }}<t-tag class="id-tag" size="small" variant="light">{{ row.subjectTag }}</t-tag>
                </template>
                <template v-else>{{ row.subject }}</template>
              </template>
              <template #slot="{ row }">
                <div class="slot-cell">
                  <span>{{ row.date }}</span>
                  <span class="slot-time">{{ row.startTime }} ~ {{ row.endTime }}</span>
                  <span v-if="row.source === 'event'" class="slot-time">社区活动「{{ row.title }}」</span>
                </div>
              </template>
              <template #status="{ row }">
                <StatusTag v-if="row.source === 'reservation'" entity="reservation" :value="row.status" />
                <t-tag v-else theme="danger" variant="light" size="small">活动占用</t-tag>
              </template>
            </t-table>
            <div v-if="reservations.length < reservationTotal" class="more-row">
              仅显示 {{ reservations.length }} / {{ reservationTotal }} 条预约
              <t-button variant="text" size="small" :loading="loadingMore" @click="loadMoreReservations">
                加载更多
              </t-button>
            </div>
          </div>
        </div>
      </div>
      </template>
    </t-loading>

    <SpaceFormDialog v-model:visible="formVisible" mode="edit" :space="space" @success="load" />
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.card-section-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.calendar-card {
  margin: 16px 0;
}

.more-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 日历（2/3）+ 当月预约明细（1/3）双栏布局 */
.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  align-items: start;
}

/* 全站中等宽度断点已统一为 1199px；此处 1100px 是为「日历 2/3 + 预约明细 1/3」双栏
 * 塌陷专门校准的取值，并入 1199px 会过早塌成单列、浪费横向空间，故单独保留 */
@media (max-width: 1100px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.detail-col {
  border-left: 1px solid var(--td-component-border);
  padding-left: 20px;
  min-width: 0;
}

@media (max-width: 1100px) {
  .detail-col {
    border-left: none;
    padding-left: 0;
  }
}

.slot-cell {
  display: flex;
  flex-direction: column;
  line-height: 18px;
}

.slot-time {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 说明：.cal-item/.cal-more 是日历单元格插槽内插入的自有节点，
 * 函数渲染的 DOM 不携带 scoped id，故须经 :deep 命中；并非覆盖 TDesign 内部类 */
/* 日历单元格内追加的预约摘要 */
.space-detail :deep(.cal-item) {
  font-size: 12px;
  line-height: 16px;
  padding: 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.space-detail :deep(.cal-item.is-approved) {
  color: var(--td-success-color);
}

.space-detail :deep(.cal-item.is-using) {
  color: var(--td-brand-color);
}

.space-detail :deep(.cal-item.is-pending) {
  color: var(--td-warning-color);
}

.space-detail :deep(.cal-item.is-ended) {
  color: var(--td-text-color-placeholder);
}

.space-detail :deep(.cal-item.is-rejected),
.space-detail :deep(.cal-item.is-cancelled) {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

/* 活动占用（已发布活动）：用 error 色与预约五态区分，表示该时段不可预约 */
.space-detail :deep(.cal-item.is-event) {
  color: var(--td-error-color);
}

.space-detail :deep(.cal-more) {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.cal-legend {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.cal-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--td-radius-default);
  display: inline-block;
}

.legend-dot.is-approved {
  background: var(--td-success-color);
}

.legend-dot.is-using {
  background: var(--td-brand-color);
}

.legend-dot.is-pending {
  background: var(--td-warning-color);
}

.legend-dot.is-ended {
  background: var(--td-text-color-placeholder);
}

.legend-dot.is-muted {
  background: var(--td-text-color-placeholder);
}

.legend-dot.is-event {
  background: var(--td-error-color);
}

.cal-legend-item.is-approved {
  color: var(--td-success-color);
}

.cal-legend-item.is-using {
  color: var(--td-brand-color);
}

.cal-legend-item.is-pending {
  color: var(--td-warning-color);
}

.cal-legend-item.is-ended {
  color: var(--td-text-color-placeholder);
}

.cal-legend-item.is-muted {
  color: var(--td-text-color-placeholder);
}

.cal-legend-item.is-event {
  color: var(--td-error-color);
}
</style>
