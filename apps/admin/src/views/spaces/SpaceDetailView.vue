<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon, EditIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import SpaceFormDialog from '@/components/SpaceFormDialog.vue'
import { fetchReservations, fetchSpace, setSpaceStatus } from '@/api/spaces'
import { spaceTypeMap, statusMap } from '@/constants/status'
import { deriveReservationStatus } from '@/utils/reservation'
import { formatMonthKey } from '@/utils/format'
import type { Space, SpaceReservation } from '@/types'

/* 空间详情页：空间信息 + Calendar 日历（cellAppend 追加当日预约详情）+ 预约明细表。
 * 头部操作与公共空间列表 op 同步（可用：编辑/维护/停用；维护或停用：恢复可用）。 */
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const space = ref<Space | null>(null)
const reservations = ref<SpaceReservation[]>([])
const acting = ref('')
const formVisible = ref(false)
/* 已归档条目：隐藏写操作（编辑/状态变更），只读内容保留 */
const isArchived = computed(() => !!space.value?.deletedAt)

/* 预约按日期分组：日历 cellAppend 按 formattedDate 直接取数 */
const byDate = computed(() => {
  const map: Record<string, SpaceReservation[]> = {}
  for (const r of reservations.value) {
    if (!map[r.date]) map[r.date] = []
    map[r.date].push(r)
  }
  return map
})

/* 日历单元格当日预约（不存在返回空数组，模板中可安全遍历） */
function reservationsOn(formattedDate: string): SpaceReservation[] {
  return byDate.value[formattedDate] ?? []
}

/* 预约状态文案：统一走六态派生（与 StatusTag / 列表页口径一致） */
function reservationStatusLabel(r: SpaceReservation): string {
  return statusMap.reservation[deriveReservationStatus(r)].label
}

const reservationModeText = computed(() =>
  space.value?.needReservation
    ? space.value.needApproval
      ? '需预约 · 需审核'
      : '需预约 · 免审核'
    : '免预约',
)

const detailColumns = [
  { colKey: 'user', title: '预约人', cell: 'user', width: 110 , ellipsis: true},
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

const monthReservations = computed(() => reservations.value.filter((r) => r.date.startsWith(monthKey.value)))

const periodText = computed(() =>
  space.value?.allDay ? '全天开放' : `${space.value?.openTime ?? ''} ~ ${space.value?.closeTime ?? ''}`,
)

const equipmentText = computed(() =>
  space.value && space.value.equipment.length > 0 ? space.value.equipment.join('、') : '—',
)

async function load() {
  loading.value = true
  try {
    const id = String(route.params.id)
    const [s, res] = await Promise.all([
      fetchSpace(id),
      fetchReservations({ page: 1, pageSize: 100, spaceId: id }),
    ])
    space.value = s
    reservations.value = res.list
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '空间加载失败')
  } finally {
    loading.value = false
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
    <t-button variant="text" theme="default" class="back-btn" @click="router.push('/spaces')">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <PageHeader :title="space?.name ?? '空间详情'" :description="`${spaceTypeMap[space?.type ?? 'meeting'] ?? ''} · ${space?.location ?? ''}`">
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
      <t-empty v-if="!loading && !space" description="空间不存在、已归档或加载失败" />
      <template v-else-if="space">
      <div class="page-card">
        <t-descriptions :column="3" bordered>
          <t-descriptions-item label="空间类型">{{ spaceTypeMap[space?.type ?? 'meeting'] ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="容量">{{ space?.capacity ?? '—' }} 人</t-descriptions-item>
          <t-descriptions-item label="状态">
            <StatusTag v-if="space" entity="space" :value="space.status" />
          </t-descriptions-item>
          <t-descriptions-item label="开放时段">{{ periodText }}</t-descriptions-item>
          <t-descriptions-item label="预约方式" :span="2">{{ reservationModeText }}</t-descriptions-item>
          <t-descriptions-item label="配备设备" :span="3">{{ equipmentText }}</t-descriptions-item>
          <t-descriptions-item label="空间说明" :span="3">{{ space?.description || '—' }}</t-descriptions-item>
        </t-descriptions>
      </div>

      <!-- 预约日历（2/3 宽）+ 当月预约明细（1/3 宽） -->
      <div class="page-card calendar-card">
        <div class="detail-grid">
          <div class="calendar-col">
            <h4 class="card-section-title">预约日历</h4>
            <!-- cellAppend：在日历单元格原内容之后追加当日预约摘要。
                 插槽作用域 = CalendarCell 本体（源码链路完整验证：calendar-cell.mjs renderContent(name, void 0, { params: cellData })
                 → useContent 包一层 { params: cellData } → useTNodeJSX 里 getParams 再拆掉包装 → handleSlots 把 cellData 本体传给插槽）。
                 因此 #cellAppend="cell" 才正确；写成 "{ cell }" 或 "{ params }" 都会让解构结果为 undefined 而崩溃
                 （每个单元格一次渲染错误，tbody 整体渲染失败 → 只剩控制器和星期表头）。勿改回解构写法。
                 belongTo === 0 表示本月日期；日期取值统一走 reservationsOn()，不存在返回空数组 -->
            <t-calendar :controller-config="calendarController" @controller-change="onControllerChange">
              <template #cellAppend="cell">
                <template v-if="cell.belongTo === 0 && reservationsOn(cell.formattedDate).length > 0">
                  <div
                    v-for="r in reservationsOn(cell.formattedDate).slice(0, 3)"
                    :key="r.id"
                    class="cal-item"
                    :class="`is-${deriveReservationStatus(r)}`"
                    :title="`${r.date} ${r.startTime} ~ ${r.endTime} ${r.userName}（${r.purpose}）· ${reservationStatusLabel(r)}`"
                  >
                    {{ r.startTime }} {{ r.userName }}
                  </div>
                  <div v-if="reservationsOn(cell.formattedDate).length > 3" class="cal-more">
                    共 {{ reservationsOn(cell.formattedDate).length }} 条预约
                  </div>
                </template>
              </template>
            </t-calendar>
            <div class="cal-legend">
              <span class="cal-legend-item is-approved">待使用</span>
              <span class="cal-legend-item is-using">使用中</span>
              <span class="cal-legend-item is-pending">待审核</span>
              <span class="cal-legend-item is-ended">已结束</span>
              <span class="cal-legend-item is-muted">已驳回/已取消</span>
            </div>
          </div>
          <div class="detail-col">
            <h4 class="card-section-title">{{ monthKey }} 明细（{{ monthReservations.length }}）</h4>
            <t-table
              row-key="id"
              hover
              size="small"
              :data="monthReservations"
              :columns="detailColumns"
              empty="该月暂无预约"
            >
              <template #user="{ row }">
                {{ row.userName }}<t-tag class="id-tag" size="small" variant="light">{{ row.userId }}</t-tag>
              </template>
              <template #slot="{ row }">
                <div class="slot-cell">
                  <span>{{ row.date }}</span>
                  <span class="slot-time">{{ row.startTime }} ~ {{ row.endTime }}</span>
                </div>
              </template>
              <template #status="{ row }">
                <StatusTag entity="reservation" :value="deriveReservationStatus(row)" />
              </template>
            </t-table>
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

/* 日历（2/3）+ 当月预约明细（1/3）双栏布局 */
.detail-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  align-items: start;
}

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

/* 日历单元格内追加的预约摘要 */
.space-detail :deep(.cal-item) {
  font-size: 11px;
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

.space-detail :deep(.cal-more) {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.cal-legend {
  display: flex;
  gap: 16px;
  margin-top: 8px;
}

.cal-legend-item {
  font-size: 12px;
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
</style>
