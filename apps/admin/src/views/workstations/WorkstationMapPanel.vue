<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AddIcon, BuildingIcon, CheckCircleIcon, MapIcon, SettingIcon, ViewModuleIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import AreaPlanDialog from '@/components/AreaPlanDialog.vue'
import WorkstationFormDialog from '@/components/WorkstationFormDialog.vue'
import { fetchWorkstationAreas, fetchWorkstations } from '@/api/workstations'
import { workstationTypeMap } from '@/constants/status'
import type { Workstation, WorkstationArea, WorkstationStatus } from '@/types'

/* 办公位管理页（独立路由页）：开放工位/半开放工位的平面图总览；
 * 状态卡片点击筛选（点击「办公位总数」取消）、区域下拉筛选，两者可叠加；
 * 区域规划/创建办公位在页头操作区；点击工位卡片可编辑资料（含维护中开关）；
 * 独立办公室（type=office）在「办公室管理」页维护，租约在「租赁管理」页管理 */
const loading = ref(false)
const list = ref<Workstation[]>([])
const areas = ref<WorkstationArea[]>([])
/* 状态筛选：'' = 全部（由「办公位总数」卡片设置）；区域筛选：'' = 全部 */
const statusFilter = ref<WorkstationStatus | ''>('')
const areaFilter = ref('')

/* 全量开放/半开放工位（独立办公室见办公室管理页）——汇总卡片始终统计全量 */
const desks = computed(() => list.value.filter((w) => w.type !== 'office'))

const idleCount = computed(() => desks.value.filter((w) => w.status === 'idle').length)
const assignedCount = computed(() => desks.value.filter((w) => w.status === 'assigned').length)
const maintenanceCount = computed(() => desks.value.filter((w) => w.status === 'maintenance').length)

/* 筛选后的工位：状态卡片 + 区域下拉组合过滤 */
const filteredDesks = computed(() =>
  desks.value.filter(
    (w) =>
      (!statusFilter.value || w.status === statusFilter.value) &&
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

/* 区域筛选选项：仅开放工位/半开放工位区域（独立办公室区域见办公室管理页），含"全部" */
const areaOptions = computed(() => [
  { label: '全部区域', value: '' },
  ...areas.value.filter((a) => a.type !== 'office').map((a) => ({ label: a.name, value: a.name })),
])

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '空闲', value: 'idle' },
  { label: '已分配', value: 'assigned' },
  { label: '维护中', value: 'maintenance' },
]

/* 状态卡片筛选：点击对应状态卡片筛选，点击「办公位总数」卡片取消（与状态下拉双向同步） */
function setStatFilter(status: WorkstationStatus | '') {
  statusFilter.value = status
}

/* silent=true 静默刷新：区域规划保存后仅更新分组名称与区域选项，不触发加载遮罩（避免卡片板块闪烁） */
async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const [ws, areaList] = await Promise.all([fetchWorkstations(), fetchWorkstationAreas()])
    list.value = ws
    areas.value = areaList
  } finally {
    if (!silent) loading.value = false
  }
}

onMounted(load)

/* 区域规划弹窗 */
const areaPlanVisible = ref(false)

/* 创建 / 编辑工位（点击卡片编辑） */
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
</script>

<template>
  <div class="ws-map-panel page-fade-in">
    <PageHeader title="办公位管理" description="开放工位与半开放工位的平面图总览（独立办公室见「办公室管理」，租约见「租赁管理」）">
      <template #actions>
        <t-button variant="outline" @click="areaPlanVisible = true">
          <template #icon><MapIcon /></template>
          区域规划
        </t-button>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          创建办公位
        </t-button>
      </template>
    </PageHeader>

    <div class="stat-row">
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
        :active="statusFilter === 'assigned'"
        @click="setStatFilter('assigned')"
      />
      <StatCard
        class="stat-clickable"
        label="空闲中"
        :value="idleCount"
        :icon="CheckCircleIcon"
        :active="statusFilter === 'idle'"
        @click="setStatFilter('idle')"
      />
      <StatCard
        class="stat-clickable"
        label="维护中"
        :value="maintenanceCount"
        :icon="SettingIcon"
        :active="statusFilter === 'maintenance'"
        @click="setStatFilter('maintenance')"
      />
    </div>

    <div class="page-filter-bar">
      <t-select clearable v-model="areaFilter" label="区域" :options="areaOptions" style="width: 220px" />
      <t-select clearable v-model="statusFilter" label="状态" :options="statusOptions" style="width: 180px" />
    </div>

    <div class="legend-row">
      <span class="legend-item"><i class="legend-dot is-idle" />空闲</span>
      <span class="legend-item"><i class="legend-dot is-assigned" />已分配</span>
      <span class="legend-item"><i class="legend-dot is-maintenance" />维护中</span>
      <span class="legend-tip">点击卡片可编辑工位信息</span>
    </div>

    <div v-for="g in areaGroups" :key="g.area" class="area-section">
      <h4 class="area-title">
        {{ g.area }}
        <span class="area-count">{{ g.items.length }} 个工位</span>
      </h4>
      <t-loading :loading="loading" size="small">
        <div class="ws-grid">
        <t-card
          v-for="w in g.items"
          :key="w.id"
          class="ws-card"
          :class="`is-${w.status}`"
          size="small"
          hover-shadow
          @click="openEdit(w)"
        >
          <div class="ws-head">
            <span class="ws-seat">{{ w.seatNo }}</span>
            <StatusTag entity="workstation" :value="w.status" />
          </div>
          <div class="ws-type">{{ workstationTypeMap[w.type] ?? w.type }} · 容纳 {{ w.capacity }} 人</div>
          <div v-if="w.enterpriseName" class="ws-enterprise" :title="`${w.enterpriseName}（${w.leaseId}）`">
            {{ w.enterpriseName }}
          </div>
          <div v-else class="ws-enterprise ws-enterprise-empty">暂未分配</div>
        </t-card>
        </div>
      </t-loading>
    </div>

    <t-empty v-if="areaGroups.length === 0" class="grid-empty" description="暂无符合条件的工位" />

    <!-- 区域规划弹窗（保存后静默刷新分组名称，避免卡片板块闪烁） -->
    <AreaPlanDialog v-model:visible="areaPlanVisible" @success="load(true)" />

    <!-- 创建 / 编辑工位弹窗 -->
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
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.legend-row {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  font-size: 14px;
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
  gap: 12px;
}

/* 工位卡片：t-card 为内核（边框/圆角/悬浮阴影来自 TDesign），状态底色覆盖容器背景 */
.ws-card {
  cursor: pointer;
  min-height: 96px;
  display: flex;
  flex-direction: column;
}

.ws-card :deep(.t-card__body) {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.ws-type {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ws-enterprise {
  font-size: 12px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-enterprise-empty {
  color: var(--td-text-color-placeholder);
}
</style>
