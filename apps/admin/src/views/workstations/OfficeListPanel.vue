<script setup lang="ts">
import { useListQueryState } from '@/utils/listQuery'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AddIcon, BuildingIcon, CheckCircleIcon, MapIcon, SettingIcon, ViewModuleIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import AreaPlanDialog from '@/components/AreaPlanDialog.vue'
import WorkstationFormDialog from '@/components/WorkstationFormDialog.vue'
import { fetchLeases, fetchWorkstationAreas, fetchWorkstations } from '@/api/workstations'
import { workstationTypeMap } from '@/constants/status'
import type { Lease, Workstation, WorkstationArea, WorkstationStatus } from '@/types'

/* 办公室管理页（独立路由页）：独立办公室（type=office）的占用、租期与维护管理；
 * 状态勾选式筛选（与状态卡片快速勾选双向同步，点击「办公室总数」清空=显示全部）、区域下拉筛选，两者可叠加；
 * 区域规划/新增办公位在页头操作区；卡片提供「编辑」（含维护中开关）与「关联租赁」（跳转租赁管理并预选）操作；
 * 租约全生命周期操作在「租赁管理」页 */
const loading = ref(false)
const loadError = ref('')
const workstations = ref<Workstation[]>([])
const leases = ref<Lease[]>([])
const areas = ref<WorkstationArea[]>([])
/* 勾选式状态筛选：默认仅勾选空闲/已分配（维护中需手动勾选查看）；空勾选=显示全部；区域筛选：'' = 全部 */
const DEFAULT_STATUS_FILTER: WorkstationStatus[] = ['idle', 'assigned']
const statusFilter = ref<WorkstationStatus[]>([...DEFAULT_STATUS_FILTER])
const areaFilter = ref('')

/* 全量独立办公室——汇总卡片始终统计全量 */
const offices = computed(() => workstations.value.filter((w) => w.type === 'office'))
const assignedCount = computed(() => offices.value.filter((w) => w.status === 'assigned').length)
const idleCount = computed(() => offices.value.filter((w) => w.status === 'idle').length)
const maintenanceCount = computed(() => offices.value.filter((w) => w.status === 'maintenance').length)

/* 筛选后的办公室：状态勾选 + 区域下拉组合过滤（空勾选=不按状态过滤） */
const filteredOffices = computed(() =>
  offices.value.filter(
    (w) =>
      (statusFilter.value.length === 0 || statusFilter.value.includes(w.status)) &&
      (!areaFilter.value || w.area === areaFilter.value),
  ),
)

/* 区域筛选选项：仅独立办公室区域，含"全部" */
const areaOptions = computed(() => [
  { label: '全部区域', value: '' },
  ...areas.value.filter((a) => a.type === 'office').map((a) => ({ label: a.name, value: a.name })),
])

const statusOptions = [
  { label: '空闲', value: 'idle' },
  { label: '已分配', value: 'assigned' },
  { label: '维护中', value: 'maintenance' },
]

function leaseOf(ws: Workstation): Lease | undefined {
  return leases.value.find((l) => l.id === ws.leaseId)
}

function leaseEndText(lease: Lease): string {
  if (lease.longTerm || !lease.endDate) return '长期租约'
  const [y, m, d] = lease.endDate.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.floor((end.getTime() - today.getTime()) / 86400000)
  const suffix = days > 0 ? `${days}天后到期` : days === 0 ? '今天到期' : `已过期${-days}天`
  return `${lease.endDate} ~ ${suffix}`
}

/* 状态卡片快速筛选：点击勾选/取消该状态（与勾选式筛选器双向同步）；「办公室总数」卡片（''）清空状态筛选=显示全部 */
function setStatFilter(status: WorkstationStatus | '') {
  if (!status) {
    statusFilter.value = []
    return
  }
  statusFilter.value = statusFilter.value.includes(status)
    ? statusFilter.value.filter((s) => s !== status)
    : [...statusFilter.value, status]
}

/* 空态筛选判定：状态取默认勾选集时不算筛选（顺序无关比较）；区域非空即视为筛选无结果 */
const statusIsFiltered = computed(() => {
  const sort = (a: WorkstationStatus[]) => [...a].sort()
  return JSON.stringify(sort(statusFilter.value)) !== JSON.stringify(sort(DEFAULT_STATUS_FILTER))
})
const filterState = computed(() => ({
  status: statusIsFiltered.value ? statusFilter.value : '',
  area: areaFilter.value,
}))

/* 清除筛选：仅重置筛选条件（列表为客户端派生，无需重新请求）；状态筛选恢复默认勾选集 */
function onReset() {
  statusFilter.value = [...DEFAULT_STATUS_FILTER]
  areaFilter.value = ''
}

/* silent=true 静默刷新：区域规划保存后仅更新分组名称与区域选项，不触发加载遮罩（避免卡片板块闪烁） */
async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const [ws, ls, areaList] = await Promise.all([fetchWorkstations(), fetchLeases(), fetchWorkstationAreas()])
    workstations.value = ws
    leases.value = ls
    areas.value = areaList
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (!silent) loading.value = false
  }
}

/* 状态勾选不写入 URL：空数组会被 vue-router 丢弃、恢复时弹回默认集，导致「取消全部勾选」无法生效。
 * 状态筛选仅存组件内：刷新页面恢复默认勾选集（空闲/已分配），区域筛选保持 URL 同步 */
useListQueryState({}, undefined, { refs: { area: areaFilter }, live: true })

onMounted(load)

/* 区域规划弹窗 */
const areaPlanVisible = ref(false)

/* 新增 / 编辑办公室 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentOffice = ref<Workstation | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentOffice.value = null
  formVisible.value = true
}

function openEdit(row: Workstation) {
  formMode.value = 'edit'
  currentOffice.value = row
  formVisible.value = true
}

/* 关联租赁：跳转租赁管理并自动打开新增租约弹窗、预选该办公室 */
const router = useRouter()
function goLease(row: Workstation) {
  router.push({ path: '/workstations/leases', query: { create: '1', workstationId: row.id } })
}

/* 查看租赁（已分配）：跳转该办公室当前租约详情页 */
function goLeaseDetail(row: Workstation) {
  const id = row.leaseId ?? leaseOf(row)?.id
  if (id) router.push(`/workstations/leases/${id}`)
}

function enterpriseHref(w: Workstation): string | undefined {
  const id = w.enterpriseId
  if (!id) return undefined
  if (id.startsWith('U')) return router.resolve('/users/' + id).href
  if (id.startsWith('XE')) return router.resolve('/external-enterprises/' + id).href
  if (id.startsWith('E')) return router.resolve('/enterprises/' + id).href
  return undefined
}
</script>

<template>
  <div class="office-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="办公室管理" description="独立办公室的占用企业与维护状态（卡片可编辑资料或关联租赁）；租约新增/续期/终止在「租赁管理」页操作">
      <template #actions>
        <t-button variant="outline" @click="areaPlanVisible = true">
          <template #icon><MapIcon /></template>
          区域规划
        </t-button>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增办公室
        </t-button>
      </template>
    </PageHeader>

    <div class="stat-row stat-row--4">
      <StatCard
        class="stat-clickable"
        label="办公室总数"
        :value="offices.length"
        :icon="ViewModuleIcon"
        @click="setStatFilter('')"
      />
      <StatCard
        class="stat-clickable"
        label="已分配"
        :value="assignedCount"
        :icon="BuildingIcon"
        :active="statusFilter.includes('assigned')"
        @click="setStatFilter('assigned')"
      />
      <StatCard
        class="stat-clickable"
        label="空闲中"
        :value="idleCount"
        :icon="CheckCircleIcon"
        :active="statusFilter.includes('idle')"
        @click="setStatFilter('idle')"
      />
      <StatCard
        class="stat-clickable"
        label="维护中"
        :value="maintenanceCount"
        :icon="SettingIcon"
        :active="statusFilter.includes('maintenance')"
        @click="setStatFilter('maintenance')"
      />
    </div>

    <div class="page-filter-bar">
      <t-select v-accessible-field="'区域'" class="ctl-w-xl" clearable v-model="areaFilter" label="区域" :options="areaOptions" />
      <div class="office-status-filter" role="group" aria-label="状态筛选">
        <span class="office-status-label">状态</span>
        <t-checkbox-group v-model="statusFilter" :options="statusOptions" />
      </div>
    </div>

    <div class="legend-row">
      <span class="legend-item"><i class="legend-dot is-idle" />空闲</span>
      <span class="legend-item"><i class="legend-dot is-assigned" />已分配</span>
      <span class="legend-item"><i class="legend-dot is-maintenance" />维护中</span>
      <span class="legend-tip">卡片可「编辑」资料或「关联租赁」</span>
    </div>

    <t-loading :loading="loading" size="small">
      <ListEmptyState
        v-if="!loading && filteredOffices.length === 0"
        class="grid-empty"
        :query="filterState"
        description="暂无办公室"
        @clear="onReset"
      />
      <div class="office-grid">
      <t-card
        v-for="w in filteredOffices"
        :key="w.id"
        class="office-card"
        :class="`is-${w.status}`"
        size="small"
        hover-shadow
      >
        <div class="office-head">
          <span class="office-seat">{{ w.seatNo }}</span>
          <StatusTag entity="workstation" :value="w.status" />
        </div>
        <div class="office-area">{{ w.area }} · {{ workstationTypeMap[w.type] ?? w.type }}</div>
        <div class="office-capacity">容纳 {{ w.capacity }} 人</div>

        <template v-if="w.enterpriseName">
          <div class="office-enterprise-row">
            <t-link class="office-enterprise clickable" :title="w.enterpriseName" :href="enterpriseHref(w)" :disabled="!enterpriseHref(w)" theme="primary" hover="color">{{ w.enterpriseName }}</t-link>
            <t-tag v-if="w.enterpriseId" size="small" variant="light">{{ w.enterpriseId }}</t-tag>
          </div>
          <div v-if="leaseOf(w)" class="office-lease">{{ leaseEndText(leaseOf(w)!) }}</div>
        </template>
        <div v-else class="office-enterprise office-enterprise-empty">暂未分配</div>

        <div class="office-actions">
          <t-button variant="text" size="small" @click="openEdit(w)">编辑</t-button>
          <t-button
            v-if="w.status === 'assigned'"
            variant="text"
            size="small"
            theme="primary"
            :disabled="!(w.leaseId ?? leaseOf(w)?.id)"
            :title="w.leaseId ?? leaseOf(w)?.id ? '查看该办公室当前关联的租赁详情' : '未找到关联租约'"
            @click="goLeaseDetail(w)"
          >
            查看租赁
          </t-button>
          <t-button
            v-else
            variant="text"
            size="small"
            theme="primary"
            :disabled="w.status !== 'idle'"
            :title="w.status !== 'idle' ? '仅空闲办公室可关联租赁' : '前往租赁管理为该办公室新增租约'"
            @click="goLease(w)"
          >
            关联租赁
          </t-button>
        </div>
      </t-card>
      </div>
      </t-loading>

    <!-- 区域规划弹窗（保存后静默刷新分组名称，避免卡片板块闪烁） -->
    <AreaPlanDialog v-model:visible="areaPlanVisible" @success="load(true)" />

    <!-- 新增 / 编辑办公室弹窗 -->
    <WorkstationFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :workstation="currentOffice"
      default-type="office"
      @success="load"
    />
  </div>
</template>

<style scoped>
.legend-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 16px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.legend-tip {
  margin-left: auto;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.grid-empty {
  padding: 32px 0;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--td-radius-default);
  display: inline-block;
}

.legend-dot.is-idle {
  background: var(--td-success-color);
}

.legend-dot.is-assigned {
  background: var(--td-brand-color);
}

.legend-dot.is-maintenance {
  background: var(--td-warning-color);
}

.office-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

/* 办公室卡片：t-card 为内核（边框/圆角/悬浮阴影来自 TDesign），状态底色覆盖容器背景 */
.office-card {
  min-height: 96px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 依赖 TDesign 内部类：t-loading 包裹层 .t-loading__parent 与 t-card 内容区 .t-card__body。
 * 目的：卡片内容撑满高度（flex 链）+ 紧凑内边距；t-loading/t-card 无对应布局 API。
 * TDesign 升级若调整这两个类名需同步检查。 */
.office-card :deep(.t-loading__parent) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.office-card :deep(.t-card__body) {
  flex: 1;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.office-card.is-idle {
  background: var(--td-success-color-1);
}

.office-card.is-assigned {
  background: var(--td-brand-color-1);
}

.office-card.is-maintenance {
  background: var(--td-warning-color-1);
}

.office-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.office-seat {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.office-area {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.office-capacity {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.office-enterprise-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.office-enterprise-row .office-enterprise {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 企业名链接：与办公位管理页 .ws-enterprise 同口径（12px + hover 变色） */
.office-enterprise {
  font-size: 12px;
  color: var(--td-text-color-primary);
}

.office-enterprise.clickable {
  cursor: pointer;
}

.office-enterprise.clickable:hover {
  color: var(--td-brand-color);
}

.office-enterprise-empty {
  font-weight: 400;
  color: var(--td-text-color-placeholder);
}

.office-lease {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.office-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--td-component-border);
}

/* 勾选式状态筛选：可见标签 + 复选组，与输入/下拉控件同排对齐 */
.office-status-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.office-status-label {
  color: var(--td-text-color-secondary);
}
</style>
