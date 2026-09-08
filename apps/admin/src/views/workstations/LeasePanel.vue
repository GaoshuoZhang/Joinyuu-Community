<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import StatCard from '@/components/StatCard.vue'
import LeaseFormDialog from '@/components/LeaseFormDialog.vue'
import { deriveLeaseStatus, fetchLeases, fetchWorkstations, terminateLease, type LeaseViewStatus } from '@/api/workstations'
import type { Lease, Workstation } from '@/types'

/* 租约管理面板：创建租约（=分配办公位）/ 续期编辑 / 终止释放工位；
 * 状态 active/expiring/expired/terminated 由结束日期读取时派生 */
const loading = ref(false)
const leases = ref<Lease[]>([])
const workstations = ref<Workstation[]>([])
const acting = ref('')

const columns = [
  { colKey: 'id', title: '租约编号', width: 110 },
  { colKey: 'enterpriseName', title: '租赁方', cell: 'enterprise', width: 170, resizable: true },
  { colKey: 'workstationLabels', title: '工位', cell: 'workstations', minWidth: 180, resizable: true },
  { colKey: 'term', title: '租期', cell: 'term', width: 200, resizable: true },
  { colKey: 'monthlyRent', title: '租金（元）', cell: 'rent', width: 110, resizable: true },
  { colKey: 'contactName', title: '联系人', cell: 'contact', width: 160, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 110, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 130 },
]

const statusCount = (s: LeaseViewStatus) =>
  leases.value.filter((l) => deriveLeaseStatus(l) === s).length

/* 租赁周期单位展示（缺省按月） */
const rentPeriodMap: Record<string, string> = { day: '日', week: '周', month: '月', year: '年' }
function rentPeriodLabel(row: Lease) {
  return rentPeriodMap[row.rentPeriod ?? 'month']
}

async function load() {
  loading.value = true
  try {
    const [ls, ws] = await Promise.all([fetchLeases(), fetchWorkstations()])
    leases.value = ls
    workstations.value = ws
  } finally {
    loading.value = false
  }
}

/* 终止租约并释放工位 */
async function onTerminate(row: Lease) {
  acting.value = row.id
  try {
    await terminateLease(row.id)
    MessagePlugin.success(`租约已终止，关联工位已释放（${row.workstationLabels.join('、')}）`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 创建 / 编辑租约 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentLease = ref<Lease | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentLease.value = null
  formVisible.value = true
}

function openEdit(row: Lease) {
  formMode.value = 'edit'
  currentLease.value = row
  formVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="lease-panel page-fade-in">
    <PageHeader title="租赁管理" description="办公位与办公室租约的创建、续期与终止；创建租约即完成工位/办公室分配" />

    <div class="stat-row">
      <StatCard label="生效中" :value="statusCount('active')" />
      <StatCard label="即将到期" :value="statusCount('expiring')" />
      <StatCard label="已到期" :value="statusCount('expired')" />
      <StatCard label="已终止" :value="statusCount('terminated')" />
    </div>

    <div class="page-filter-bar">
      <span class="panel-tip">即将到期（15 天内）与已到期由租期结束日期自动派生；创建租约即完成工位分配。</span>
      <t-button variant="outline" style="margin-left: auto" @click="load">
        <template #icon><RefreshIcon /></template>
        刷新
      </t-button>
      <t-button theme="primary" @click="openCreate">
        <template #icon><AddIcon /></template>
        创建租约
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="leases"
        :columns="columns"
        :loading="loading"
        empty="暂无租约数据"
      >
        <template #enterprise="{ row }">
          <div class="cell-title">{{ row.enterpriseName }}</div>
          <div class="cell-sub">{{ row.enterpriseId }}</div>
        </template>
        <template #workstations="{ row }">
          <t-tag v-for="label in row.workstationLabels" :key="label" variant="light" class="ws-tag">
            {{ label }}
          </t-tag>
        </template>
        <template #term="{ row }">
          {{ row.longTerm ? `${row.startDate} ~ 长期` : `${row.startDate} ~ ${row.endDate}` }}
        </template>
        <template #rent="{ row }">
          {{ row.monthlyRent }} / {{ rentPeriodLabel(row) }}
        </template>
        <template #contact="{ row }">
          <div class="cell-title">{{ row.contactName }}</div>
          <div class="cell-sub">{{ row.contactPhone }}</div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="lease" :value="deriveLeaseStatus(row)" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button
              v-if="row.status === 'active'"
              variant="text"
              size="small"
              @click="openEdit(row)"
            >
              编辑
            </t-button>
            <t-popconfirm
              v-if="row.status === 'active'"
              content="确认终止该租约？关联工位将立即释放"
              @confirm="onTerminate(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id">
                终止
              </t-button>
            </t-popconfirm>
            <span v-if="row.status === 'terminated'" class="terminated-at">
              终止于 {{ row.terminatedAt ?? '—' }}
            </span>
          </div>
        </template>
      </t-table>
    </div>

    <LeaseFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :lease="currentLease"
      :workstations="workstations"
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

.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ws-tag {
  margin: 2px 4px 2px 0;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.terminated-at {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
