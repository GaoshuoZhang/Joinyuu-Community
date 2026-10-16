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

/* 办公位管理页（独立路由页）：开放办公位/半开放办公位的平面图总览；
 * 状态勾选式筛选（与状态卡片快速勾选双向同步，点击「办公位总数」清空=显示全部）、区域下拉筛选，两者可叠加；
 * 区域规划/新增办公位在页头操作区；卡片提供「编辑」（含维护中开关）与「关联租赁」（跳转租赁管理并预选）操作；
 * 独立办公室（type=office）在「办公室管理」页维护，租约在「租赁管理」页管理 */
const loading = ref(false)
const loadError = ref('')
const list = ref<Workstation[]>([])
const leases = ref<Lease[]>([])
const areas = ref<WorkstationArea[]>([])
/* 勾选式状态筛选：默认仅勾选空闲/已分配（维护中需手动勾选查看）；空勾选=显示全部；区域筛选：'' = 全部 */
const DEFAULT_STATUS_FILTER: WorkstationStatus[] = ['idle', 'assigned']
const statusFilter = ref<WorkstationStatus[]>([...DEFAULT_STATUS_FILTER])
const areaFilter = ref('')

/* 全量开放/半开放办公位（独立办公室见办公室管理页）——汇总卡片始终统计全量 */
const desks = computed(() => list.value.filter((w) => w.type !== 'office'))

const idleCount = computed(() => desks.value.filter((w) => w.status === 'idle').length)
const assignedCount = computed(() => desks.value.filter((w) => w.status === 'assigned').length)
const maintenanceCount = computed(() => desks.value.filter((w) => w.status === 'maintenance').length)

/* 筛选后的办公位：状态勾选 + 区域下拉组合过滤（空勾选=不按状态过滤） */
const filteredDesks = computed(() =>
  desks.value.filter(
    (w) =>
      (statusFilter.value.length === 0 || statusFilter.value.includes(w.status)) &&
      (!areaFilter.value || w.area === areaFilter.value),
  ),
)

/* 按区域分组（保持区域首次出现顺序） */
const areaGroups = computed(() => {
  const groups: { area: string; items: Workstation[] }[] = []
  for (const w of filteredDesks.value) {
    let g = groups.find((x) => x.area === w.area)
    if (!g) {
      g = { area: w.area, items: [] }
      groups.push(g)
    }
    g.items.push(w)
  }
  return groups
})

/* 区域筛选选项：仅开放办公位/半开放办公位区域（独立办公室区域见办公室管理页），含"全部" */
const areaOptions = computed(() => [
  { label: '全部区域', value: '' },
  ...areas.value.filter((a) => a.type !== 'office').map((a) => ({ label: a.name, value: a.name })),
])

const statusOptions = [
  { label: '空闲', value: 'idle' },
  { label: '已分配', value: 'assigned' },
  { label: '维护中', value: 'maintenance' },
]

/* 状态卡片快速筛选：点击勾选/取消该状态（与勾选式筛选器双向同步）；「办公位总数」卡片（''）清空状态筛选=显示全部 */
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
    list.value = ws
    leases.value = ls
    areas.value = areaList
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (!silent) loading.value = false
  }
}

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

/* 状态勾选不写入 URL：空数组会被 vue-router 丢弃、恢复时弹回默认集，导致「取消全部勾选」无法生效。
 * 状态筛选仅存组件内：刷新页面恢复默认勾选集（空闲/已分配），区域筛选保持 URL 同步 */
useListQueryState({}, undefined, { refs: { area: areaFilter }, live: true })

onMounted(load)

/* 区域规划弹窗 */
const areaPlanVisible = ref(false)

/* 新增 / 编辑办公位 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentWorkstation = ref<Workstation | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentWorkstation.value = null
  formVisible.value = true
}

function openEdit(row: Workstation) {
  formMode.value = 'edit'
  currentWorkstation.value = row
  formVisible.value = true
}

/* 关联租赁：跳转租赁管理并自动打开新增租约弹窗、预选该办公位 */
const router = useRouter()
function goLease(row: Workstation) {
  router.push({ path: '/workstations/leases', query: { create: '1', workstationId: row.id } })
}

/* 查看租赁（已分配）：跳转该办公位当前租约详情页；
 * 与办公室管理同口径：leaseId 缺失时回退按租约列表反查，避免「有租约却点不动」 */
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
  <div class="ws-map-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="办公位管理" description="开放办公位与半开放办公位的平面图总览（独立办公室见「办公室管理」，租约见「租赁管理」）">
      <template #actions>
        <t-button variant="outline" @click="areaPlanVisible = true">
          <template #icon><MapIcon /></template>
          区域规划
        </t-button>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增办公位
        </t-button>
      </template>
    </PageHeader>

    <div class="stat-row stat-row--4">
      <StatCard
        class="stat-clickable"
        label="办公位总数"
        :value="desks.length"
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
      <div class="ws-status-filter" role="group" aria-label="状态筛选">
        <span class="ws-status-label">状态</span>
        <t-checkbox-group v-model="statusFilter" :options="statusOptions" />
      </div>
    </div>

    <div class="legend-row">
      <span class="legend-item"><i class="legend-dot is-idle" />空闲</span>
      <span class="legend-item"><i class="legend-dot is-assigned" />已分配</span>
      <span class="legend-item"><i class="legend-dot is-maintenance" />维护中</span>
      <span class="legend-tip">卡片可「编辑」资料或「关联租赁」</span>
    </div>

    <!-- 单层加载遮罩包裹整个网格区：分组为空时首屏也能展示加载态（原先写在 v-for 内导致空分组无遮罩/多重遮罩） -->
    <t-loading :loading="loading" size="small">
      <div v-for="g in areaGroups" :key="g.area" class="area-section">
        <h4 class="area-title">
          {{ g.area }}
          <span class="area-count">{{ g.items.length }} 个办公位</span>
        </h4>
        <div class="ws-grid">
        <t-card
          v-for="w in g.items"
          :key="w.id"
          class="ws-card"
          :class="`is-${w.status}`"
          size="small"
          hover-shadow
        >
          <div class="ws-head">
            <span class="ws-seat">{{ w.seatNo }}</span>
            <StatusTag entity="workstation" :value="w.status" />
          </div>
          <div class="ws-type">{{ workstationTypeMap[w.type] ?? w.type }} · 容纳 {{ w.capacity }} 人</div>
          <template v-if="w.enterpriseName">
            <div class="ws-enterprise-row">
              <t-link
                class="ws-enterprise clickable"
                :title="w.enterpriseName"
                :href="enterpriseHref(w)" :disabled="!enterpriseHref(w)"
                theme="primary"
                hover="color"
              >{{ w.enterpriseName }}</t-link>
              <t-tag v-if="w.enterpriseId" size="small" variant="light">{{ w.enterpriseId }}</t-tag>
            </div>
            <div v-if="leaseOf(w)" class="ws-lease">{{ leaseEndText(leaseOf(w)!) }}</div>
          </template>
          <div v-else class="ws-enterprise ws-enterprise-empty">暂未分配</div>
          <div class="ws-actions">
            <t-button variant="text" size="small" @click="openEdit(w)">编辑</t-button>
            <t-button
              v-if="w.status === 'assigned'"
              variant="text"
              size="small"
              theme="primary"
              :disabled="!(w.leaseId ?? leaseOf(w)?.id)"
              :title="(w.leaseId ?? leaseOf(w)?.id) ? '查看该办公位当前关联的租赁详情' : '未找到关联租约'"
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
              :title="w.status !== 'idle' ? '仅空闲办公位可关联租赁' : '前往租赁管理为该办公位新增租约'"
              @click="goLease(w)"
            >
              关联租赁
            </t-button>
          </div>
        </t-card>
        </div>
      </div>

      <ListEmptyState
        v-if="!loading && areaGroups.length === 0"
        class="grid-empty"
        :query="filterState"
        description="暂无办公位"
        @clear="onReset"
      />
    </t-loading>

    <!-- 区域规划弹窗（保存后静默刷新分组名称，避免卡片板块闪烁） -->
    <AreaPlanDialog v-model:visible="areaPlanVisible" @success="load(true)" />

    <!-- 新增 / 编辑办公位弹窗 -->
    <WorkstationFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :workstation="currentWorkstation"
      default-type="open"
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

.area-section {
  margin-bottom: 20px;
}

.area-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.area-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--td-text-color-secondary);
}

.ws-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
}

/* 办公位卡片：t-card 为内核（边框/圆角/悬浮阴影来自 TDesign），状态底色覆盖容器背景 */
.ws-card {
  min-height: 96px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 依赖 TDesign 内部类：t-loading 包裹层 .t-loading__parent 与 t-card 内容区 .t-card__body。
 * 目的：卡片内容撑满高度（flex 链）+ 紧凑内边距；t-loading/t-card 无对应布局 API。
 * TDesign 升级若调整这两个类名需同步检查。 */
.ws-card :deep(.t-loading__parent) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.ws-card :deep(.t-card__body) {
  flex: 1;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ws-card.is-idle {
  background: var(--td-success-color-1);
}

.ws-card.is-assigned {
  background: var(--td-brand-color-1);
}

.ws-card.is-maintenance {
  background: var(--td-warning-color-1);
}

.ws-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ws-seat {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.ws-type {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ws-enterprise-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ws-enterprise-row .ws-enterprise {
  min-width: 0;
}

.ws-enterprise {
  font-size: 12px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-enterprise.clickable {
  cursor: pointer;
}

.ws-enterprise.clickable:hover {
  color: var(--td-brand-color);
}

.ws-lease {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ws-enterprise-empty {
  color: var(--td-text-color-placeholder);
}

.ws-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--td-component-border);
}

/* 勾选式状态筛选：可见标签 + 复选组，与输入/下拉控件同排对齐 */
.ws-status-filter {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-status-label {
  color: var(--td-text-color-secondary);
}
</style>
