<script setup lang="ts">
import RowMoreActions from '@/components/RowMoreActions.vue'
import { useListQueryState } from '@/utils/listQuery'
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import StatCard from '@/components/StatCard.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import LeaseFormDialog from '@/components/LeaseFormDialog.vue'
import LeaseRenewDialog from '@/components/LeaseRenewDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { archiveLease, deriveLeaseStatus, fetchLeases, fetchWorkstations, terminateLease, type LeaseViewStatus } from '@/api/workstations'
import { statusLabel } from '@/utils/exportCsv'
import { formatDateOnly } from '@/utils/format'
import type { Lease, Workstation } from '@/types'

/* 租约管理面板：新增租约（=分配办公位）/ 续期编辑 / 终止释放办公位；
 * 状态 active/expiring/expired/terminated 由结束日期读取时派生。
 * 支持 query（?renterId=&renterType=）自动筛选该主体的租约（企业/用户详情「关联租赁」跳转）。 */
const loading = ref(false)
const loadError = ref('')
const leases = ref<Lease[]>([])
const workstations = ref<Workstation[]>([])
const acting = ref('')
/* 快速筛选：状态卡片与状态下拉共用；'' = 全部 */
const statusFilter = ref<LeaseViewStatus | ''>('')
/* 关键词搜索：租约编号 / 办公位编号 / 租赁方 / 联系人 / 联系电话 */
const keyword = ref('')

const route = useRoute()
const router = useRouter()

/* query 筛选：renterId（企业 ID / 用户 UID）+ renterType（enterprise/individual） */
const renterId = ref('')
const renterType = ref('')



/* 筛选标签主体名称（企业/用户） */
const renterName = computed(() => {
  if (!renterId.value) return ''
  const hit = leases.value.find((l) => l.enterpriseId === renterId.value)
  return hit ? hit.enterpriseName : renterId.value
})

/* 主体筛选（route query）后的租约：统计卡片与列表筛选的共同基数，卡片数量口径不随快速筛选变化 */
const scopedLeases = computed(() => {
  if (!renterId.value || !renterType.value) return leases.value
  return leases.value.filter((l) => l.enterpriseId === renterId.value && (l.renterType ?? 'custom') === renterType.value)
})

/* 列表展示：主体筛选 + 状态筛选 + 关键词搜索（客户端过滤） */
const filteredLeases = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return scopedLeases.value.filter((l) => {
    if (statusFilter.value && deriveLeaseStatus(l) !== statusFilter.value) return false
    if (!kw) return true
    return [l.id, ...l.workstationLabels, l.enterpriseName, l.contactName, l.contactPhone].some((v) =>
      (v ?? '').toLowerCase().includes(kw),
    )
  })
})

/* 状态卡片快速筛选：点击选中，再点同一卡片取消（与状态下拉双向同步） */
function setStatFilter(status: LeaseViewStatus) {
  statusFilter.value = statusFilter.value === status ? '' : status
}

function clearFilter() {
  renterId.value = ''
  renterType.value = ''
}

/* 空态筛选判定：状态/关键词/主体筛选任一非空即视为筛选无结果 */
const filterState = computed(() => ({
  status: statusFilter.value,
  keyword: keyword.value,
  renterId: renterId.value,
  renterType: renterType.value,
}))

/* 清除全部筛选并重新加载 */
function onReset() {
  statusFilter.value = ''
  keyword.value = ''
  renterId.value = ''
  renterType.value = ''
  load()
}

const columns = [
  { colKey: 'id', title: '租约编号', width: 110, resizable: true , ellipsis: true},
  { colKey: 'enterpriseName', title: '租赁方', cell: 'enterprise', width: 150, resizable: true , ellipsis: true},
  { colKey: 'workstationLabels', title: '办公位', cell: 'workstations', width: 150, resizable: true , ellipsis: true},
  { colKey: 'term', title: '租期', cell: 'term', width: 220, resizable: true , ellipsis: true},
  { colKey: 'monthlyRent', title: '租金（元）', cell: 'rent', width: 110, resizable: true , ellipsis: true},
  { colKey: 'contactName', title: '联系人', cell: 'contact', width: 140, resizable: true , ellipsis: true},
  { colKey: 'note', title: '备注', cell: 'note', width: 140, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 110, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 150 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(columns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(columns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

const statusCount = (s: LeaseViewStatus) =>
  scopedLeases.value.filter((l) => deriveLeaseStatus(l) === s).length

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '生效中', value: 'active' },
  { label: '即将到期', value: 'expiring' },
  { label: '已到期', value: 'expired' },
  { label: '已终止', value: 'terminated' },
]

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
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

/* 租约打印：打开独立打印页，window.print 输出干净纸张 */
function openPrint(row: Lease) {
  window.open(router.resolve({ path: `/prints/lease/${row.id}` }).href, '_blank', 'noopener')
}

/* 租赁详情页 */
function openDetail(row: Lease) {
  router.push(`/workstations/leases/${row.id}`)
}

/* 行点击打开详情（操作列已 @click.stop，避免按钮点击触发行跳转） */
function onRowClick({ row }: { row: Lease }) {
  openDetail(row)
}

/* 终止租约并释放办公位 */
async function onTerminate(row: Lease) {
  acting.value = row.id
  try {
    await terminateLease(row.id)
    MessagePlugin.success(`租约已终止，关联办公位已释放（${row.workstationLabels.join('、')}）`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 归档已终止租约：移入归档管理，可恢复 */
async function onArchive(row: Lease) {
  acting.value = row.id + ':archive'
  try {
    await archiveLease(row.id)
    MessagePlugin.success('租约已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：全量租约中归档所选派生状态的已终止租约 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
const bulkStatuses = [{ label: '已终止', value: 'terminated' }]

async function doBulkArchive(values: string[]) {
  const all = await fetchLeases()
  const pending = all.filter((l) => values.includes(deriveLeaseStatus(l)))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档租约')
    return
  }
  let failed = 0
  for (const l of pending) {
    try {
      await archiveLease(l.id)
    } catch {
      failed++
    }
  }
  if (pending.length - failed > 0) MessagePlugin.success(`已归档 ${pending.length - failed} 条租约`)
  if (failed > 0) MessagePlugin.warning(`${failed} 条租约归档失败，请重试`)
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

/* 新增 / 编辑租约 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentLease = ref<Lease | null>(null)
/* 续期弹窗（与编辑共用 currentLease：同一次只会打开一个） */
const renewVisible = ref(false)

/* 可续期/可终止：未终止即生效中/即将到期/已到期（长期租约无到期日不可续期；
 * 已到期租约仍需「终止」释放办公位——过期不会自动释放） */
function canOperate(row: Lease): boolean {
  return ['active', 'expiring', 'expired'].includes(deriveLeaseStatus(row))
}
function canRenew(row: Lease): boolean {
  return canOperate(row) && !row.longTerm
}
/* 预选办公位：办公位/办公室卡片「关联租赁」跳转时带入（?create=1&workstationId=xxx） */
const presetWorkstationIds = ref<string[]>([])

function openCreate(presetIds: string[] = []) {
  formMode.value = 'create'
  currentLease.value = null
  presetWorkstationIds.value = presetIds
  formVisible.value = true
}

function openEdit(row: Lease) {
  formMode.value = 'edit'
  currentLease.value = row
  formVisible.value = true
}

/* 续期：延长到期日（含已到期租约，续期后自动恢复为生效中/即将到期） */
function openRenew(row: Lease) {
  currentLease.value = row
  renewVisible.value = true
}

/* 导出配置：当前页=当前筛选结果；全量结果=接口全部租约（筛选为客户端过滤，接口无分页） */
const exportHeaders = ['租约编号', '租赁方', '办公位', '租期', '租金', '联系人', '联系电话', '备注', '状态']

function mapRow(l: Lease): (string | number)[] {
  return [
    l.id,
    `${l.enterpriseName} [${l.enterpriseId || '未注册'}]`,
    l.workstationLabels.join('、'),
    l.longTerm ? `${l.startDate} ~ 长期` : `${l.startDate} ~ ${l.endDate}`,
    `${l.monthlyRent} / ${rentPeriodLabel(l)}`,
    l.contactName,
    l.contactPhone,
    l.note || '—',
    statusLabel('lease', deriveLeaseStatus(l)),
  ]
}

const pageExportRows = computed(() => filteredLeases.value.map(mapRow))

async function fetchAllForExport(page: number, pageSize: number) {
  const ls = await fetchLeases()
  return { list: ls.slice((page - 1) * pageSize, page * pageSize), total: ls.length }
}

useListQueryState({}, undefined, { refs: { status: statusFilter, keyword, renterId, renterType }, live: true })

onMounted(async () => {
  await load()
  /* 「关联租赁」跳转：自动打开新增租约弹窗并预选该办公位/办公室 */
  if (route.query.create === '1') {
    openCreate(route.query.workstationId ? [String(route.query.workstationId)] : [])
  }
})
</script>

<template>
  <div class="lease-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="租赁管理" description="办公位与办公室租约的新增、续期与终止；新增租约即完成办公位/办公室分配">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="leases"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
        <ExportButton
          filename="租约列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button theme="primary" @click="() => openCreate()">
          <template #icon><AddIcon /></template>
          新增租约
        </t-button>
      </template>
    </PageHeader>

    <div class="stat-row stat-row--4">
      <StatCard
        class="stat-clickable"
        label="生效中"
        :value="statusCount('active')"
        :active="statusFilter === 'active'"
        @click="setStatFilter('active')"
      />
      <StatCard
        class="stat-clickable"
        label="即将到期"
        :value="statusCount('expiring')"
        :active="statusFilter === 'expiring'"
        @click="setStatFilter('expiring')"
      />
      <StatCard
        class="stat-clickable"
        label="已到期"
        :value="statusCount('expired')"
        :active="statusFilter === 'expired'"
        @click="setStatFilter('expired')"
      />
      <StatCard
        class="stat-clickable"
        label="已终止"
        :value="statusCount('terminated')"
        :active="statusFilter === 'terminated'"
        @click="setStatFilter('terminated')"
      />
    </div>

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索租约编号/办公位编号/租赁方/联系人/联系电话'" class="ctl-w-2xl"
        v-model="keyword"
        placeholder="搜索租约编号/办公位编号/租赁方/联系人/联系电话…"
        clearable
      />
      <t-select v-accessible-field="'状态'" class="ctl-w-lg" v-model="statusFilter" label="状态" :options="statusOptions" clearable />
      <template v-if="renterId">
        <t-tag closable variant="light" theme="primary" @close="clearFilter">
          仅显示「{{ renterName }}」的租约
        </t-tag>
      </template>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="filteredLeases"
        :columns="visibleColumns"
        :loading="loading"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @row-click="onRowClick"
      >
        <template #enterprise="{ row }">
          <div class="cell-title">{{ row.enterpriseName }}</div>
          <t-tag v-if="row.enterpriseId" class="id-tag-block" size="small" variant="light">{{ row.enterpriseId }}</t-tag>
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
        <template #note="{ row }">
          {{ row.note || '—' }}
        </template>
        <template #status="{ row }">
          <StatusTag entity="lease" :value="deriveLeaseStatus(row)" />
          <div v-if="deriveLeaseStatus(row) === 'terminated' && row.terminatedAt" class="terminated-at">
            {{ formatDateOnly(row.terminatedAt) }}
          </div>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="openDetail(row)">详情</t-button>
            <RowMoreActions>
            <t-button variant="text" size="small" @click="openPrint(row)">打印</t-button>
            <t-button
              v-if="['active', 'expiring'].includes(deriveLeaseStatus(row))"
              variant="text"
              size="small"
              @click="openEdit(row)"
            >
              编辑
            </t-button>
            <!-- 续期：生效中/即将到期/已到期（长期租约无到期日不可续期） -->
            <t-button
              v-if="canRenew(row)"
              variant="text"
              size="small"
              theme="primary"
              @click="openRenew(row)"
            >
              续期
            </t-button>
            <!-- 终止：生效中/即将到期/已到期（终止即释放办公位；过期不自动释放） -->
            <t-popconfirm
              v-if="canOperate(row)"
              :content="`确认终止租约 ${row.id}？关联办公位将立即释放`"
              :confirm-btn="{ content: '终止租约', theme: 'danger' }"
              @confirm="onTerminate(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id">
                终止
              </t-button>
            </t-popconfirm>
            <t-popconfirm
              v-if="deriveLeaseStatus(row) === 'terminated'"
              :content="`确认归档租约 ${row.id}？归档后可在归档管理中恢复`"
              confirm-btn="归档"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':archive'">
                归档
              </t-button>
            </t-popconfirm>
            </RowMoreActions>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="filterState" description="暂无租约" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <LeaseFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :lease="currentLease"
      :workstations="workstations"
      :preset-workstation-ids="presetWorkstationIds"
      @success="load"
    />

    <!-- 续期弹窗：延长到期日并追加续期记录 -->
    <LeaseRenewDialog v-model:visible="renewVisible" :lease="currentLease" @success="load" />

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 租赁"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      @confirm="onBulkConfirm"
    />
  </div>
</template>

<style scoped>
.ws-tag {
  margin: 2px 4px 2px 0;
}

.terminated-at {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
