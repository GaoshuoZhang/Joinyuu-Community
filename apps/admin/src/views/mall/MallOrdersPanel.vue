<script setup lang="ts">
import { collectAllPages, executeBulk } from '@/utils/bulkOperation'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { ChevronDownIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { archiveOrder, cancelRedemptionOrder, fetchRedemptionOrders, verifyRedemptionOrder, type RedemptionOrderQuery } from '@/api/mall'
import { statusLabel } from '@/utils/exportCsv'
import type { RedemptionOrder } from '@/types'

/* 兑换订单面板（统一券码兑换三态）：
 * 待使用 → 核销 / 退款 / 详情；已取消、已完成 → 归档 / 详情。
 * 搜索栏支持券码精确锁定订单（keyword 同时匹配用户名/商品名/订单号/券码）。 */
const loading = ref(false)
const loadError = ref('')
const list = ref<RedemptionOrder[]>([])
const total = ref(0)
const acting = ref('')

/* 状态勾选式筛选（与活动/需求管理同一形态）：3 个可选状态（不含「全部」项）；
 * 默认勾选「待使用」，即列表默认不展示「已完成 / 已取消」；
 * 全部取消勾选 = 不按状态过滤（显示全部） */
const statusCheckOptions = [
  { label: '待使用', value: 'pending_use' },
  { label: '已完成', value: 'finished' },
  { label: '已取消', value: 'cancelled' },
]
const DEFAULT_STATUSES = ['pending_use']

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  /* 勾选式状态筛选：数组（useListQueryState 以重复 query 参数同步）；空串占位 = 不按状态过滤 */
  status: [...DEFAULT_STATUSES] as string[],
})

/* 状态勾选面板（与活动/需求管理同一形态）：勾选即查询；ESC 关闭（t-popup 仅 trigger=focus 内置 ESC 处理） */
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

const dataColumns = [
  { colKey: 'id', title: '订单编号', width: 110 , ellipsis: true},
  { colKey: 'user', title: '兑换用户', cell: 'user', width: 130 , ellipsis: true},
  { colKey: 'goodsName', title: '商品', width: 180, resizable: true, ellipsis: true },
  { colKey: 'points', title: '兑换积分', width: 90, resizable: true , ellipsis: true},
  { colKey: 'voucherCode', title: '券码', cell: 'voucherCode', width: 130 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 90, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '下单时间', width: 170, resizable: true , ellipsis: true},
  /* 操作列最宽场景为「核销 / 退款 / 详情」三按钮并排，需留足宽度避免换行溢出 */
  { colKey: 'op', fixed: 'right' as const, title: '操作', cell: 'op', width: 200 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(dataColumns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(dataColumns.map((c) => [c.colKey, c]))
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
    const res = await fetchRedemptionOrders({ ...query })
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
  query.status = [...DEFAULT_STATUSES]
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 待使用 → 已完成（现场核销） */
async function onVerify(row: RedemptionOrder) {
  acting.value = `${row.id}:verify`
  try {
    await verifyRedemptionOrder(row.id)
    MessagePlugin.success('券码已核销，订单已完成')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 待使用 → 已取消（退回积分 + 回补库存） */
async function onCancel(row: RedemptionOrder) {
  acting.value = `${row.id}:cancel`
  try {
    await cancelRedemptionOrder(row.id)
    MessagePlugin.success(`订单已退款，${row.points} 积分已退回用户账户`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已完成 / 已取消 → 归档 */
async function onArchive(row: RedemptionOrder) {
  acting.value = `${row.id}:archive`
  try {
    await archiveOrder(row.id)
    MessagePlugin.success('订单已归档，可在归档管理中恢复')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：按当前筛选全量拉取，归档所选状态的订单（已完成 / 已取消） */
const archivingAll = ref(false)
const bulkVisible = ref(false)
/* 一键归档范围快照（状态被排除，见 onBulkArchive） */
let bulkScope: RedemptionOrderQuery = { ...query }
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
const bulkStatuses = [
  { label: '已完成', value: 'finished' },
  { label: '已取消', value: 'cancelled' },
]

function onBulkCancel() {
  bulkCancelled = true
}

async function doBulkArchive(values: string[]) {
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: 0, failed: 0 }
  try {
    const targets = await collectAllPages<RedemptionOrder>(
      (page, pageSize) => fetchRedemptionOrders({ ...bulkScope, page, pageSize }), () => bulkCancelled,
    )
    const pending = targets.filter((row) => values.includes(row.status))
    if (!pending.length) {
      MessagePlugin.info(bulkCancelled ? '已取消，未执行归档' : '当前筛选范围内没有符合所选状态的记录')
      return
    }
    const result = await executeBulk(pending, (row) => archiveOrder(row.id), () => bulkCancelled,
      (progress) => { bulkProgress.value = progress })
    if (bulkCancelled) MessagePlugin.warning(`已取消，本次已归档 ${result.done - result.failed} 条订单`)
    else if (result.done > result.failed) MessagePlugin.success(`已归档 ${result.done - result.failed} 条订单`)
    if (result.failed) MessagePlugin.warning(`${result.failed} 条归档失败，请刷新后重试`)
    await load()
  } finally {
    bulkProgress.value = null
  }
}

/* 确认前预估影响条数：按所选状态取 total（pageSize=1 仅取 total）；
 * 当前列表状态筛选（勾选式数组；全不选为空串占位=不筛选）不含该状态时预估为 0 */
function countByStatus(status: string) {
  const scopeStatus = bulkScope.status
  const activeStatuses = (Array.isArray(scopeStatus) ? scopeStatus : [scopeStatus]).filter(Boolean)
  if (activeStatuses.length > 0 && !activeStatuses.includes(status)) return Promise.resolve(0)
  return fetchRedemptionOrders({ ...bulkScope, status, page: 1, pageSize: 1 }).then((result) => result.total)
}

function onBulkArchive() {
  /* 一键归档范围不含状态筛选（同活动/需求列表口径）：默认状态集已隐藏「已完成/已取消」，
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

/* 订单详情抽屉 */
const drawerVisible = ref(false)
const current = ref<RedemptionOrder | null>(null)

function openDetail(row: RedemptionOrder) {
  current.value = row
  drawerVisible.value = true
}

function isActing(row: RedemptionOrder, action: string) {
  return acting.value === `${row.id}:${action}`
}

/* 导出配置 */
const exportHeaders = ['编号', '用户', '商品', '积分', '券码', '状态', '创建时间', '核销时间']

function mapRow(o: RedemptionOrder): (string | number)[] {
  return [
    o.id,
    `${o.userName} [${o.userId}]`,
    o.goodsName,
    o.points,
    o.voucherCode,
    statusLabel('redemption', o.status),
    o.createdAt,
    o.usedAt ?? '—',
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchRedemptionOrders({ ...query, page, pageSize })
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="orders-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="订单管理" description="积分兑换订单的券码核销、退款与归档处理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="mall-orders"
          :columns="dataColumns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :loading="archivingAll" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
        <ExportButton
          filename="兑换订单列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索订单编号/用户/商品/券码'" class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索订单编号/用户/商品/券码…"
        clearable
        @enter="onSearch"
      />
      <!-- 状态：勾选式多选（默认勾选 1 项，全部取消 = 不按状态过滤）；勾选即查询 -->
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
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        重置
      </t-button>
    </div>

    <div class="page-card">
      <t-table :horizontal-scroll-affixed-bottom="{ container: '.page-scroll', offsetBottom: 0 }"
  row-key="id"
  table-layout="fixed"
  hover
  resizable
  :data="list"
  :columns="visibleColumns"
  :loading="loading"
  :pagination="pagination"
  :row-attributes="{ style: { cursor: 'pointer' } }"
  @page-change="onPageChange"
  @row-click="({ row }: { row: RedemptionOrder }) => openDetail(row)"
  >
        <template #user="{ row }">
          <div class="cell-title">{{ row.userName }}</div>
          <t-tag class="id-tag-block" size="small" variant="light">{{ row.userId }}</t-tag>
        </template>
        <template #points="{ row }">
          <span class="delta-sub">{{ -row.points }}</span>
        </template>
        <template #voucherCode="{ row }">
          <span class="voucher-code">{{ row.voucherCode }}</span>
        </template>
        <template #status="{ row }">
          <StatusTag entity="redemption" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 详情：行点击的键盘可达替代，统一置于操作列最前 -->
            <t-button theme="primary" variant="text" size="small" @click="openDetail(row)">详情</t-button>
            <!-- 待使用：核销 / 退款 -->
            <template v-if="row.status === 'pending_use'">
              <t-popconfirm
                :content="`确认核销券码 ${row.voucherCode}？核销后订单完成，不可撤销`"
                :confirm-btn="{ content: '确认核销', theme: 'danger' }"
                @confirm="onVerify(row)"
              >
                <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'verify')">
                  核销
                </t-button>
              </t-popconfirm>
              <t-popconfirm
                content="确认退款该订单？消耗积分将退回用户账户，库存回补"
                :confirm-btn="{ content: '确认退款', theme: 'danger' }"
                @confirm="onCancel(row)"
              >
                <t-button variant="text" size="small" theme="danger" :loading="isActing(row, 'cancel')">
                  退款
                </t-button>
              </t-popconfirm>
            </template>
            <!-- 已完成 / 已取消：归档 -->
            <t-popconfirm
              v-if="row.status === 'finished' || row.status === 'cancelled'"
              content="确认归档该订单？归档后可在归档管理中恢复"
              confirm-btn="归档"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="isActing(row, 'archive')">
                归档
              </t-button>
            </t-popconfirm>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无兑换订单" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 订单详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="兑换订单详情" size="min(480px, 100vw)" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <StatusTag entity="redemption" :value="current.status" size="small" />
        </div>
        <t-descriptions :column="1" title="订单信息">
          <t-descriptions-item label="兑换用户">{{ current.userName }}<t-tag class="id-tag" size="small" variant="light">{{ current.userId }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="兑换商品">{{ current.goodsName }}</t-descriptions-item>
          <t-descriptions-item label="消耗积分"><span class="delta-sub">-{{ current.points }}</span></t-descriptions-item>
          <t-descriptions-item label="下单时间">{{ current.createdAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.finishedAt" label="完成时间">{{ current.finishedAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.note" label="备注">{{ current.note }}</t-descriptions-item>
        </t-descriptions>
        <t-descriptions :column="1" title="券码信息" class="drawer-desc">
          <t-descriptions-item label="券码">
            <span class="voucher-code">{{ current.voucherCode }}</span>
            <StatusTag v-if="current.usedAt" entity="redeem" value="redeemed" class="id-tag" size="small" />
          </t-descriptions-item>
          <t-descriptions-item label="券码有效期至">{{ current.voucherExpiresAt || '长期有效' }}</t-descriptions-item>
          <t-descriptions-item v-if="current.usedAt" label="核销时间">{{ current.usedAt }}</t-descriptions-item>
        </t-descriptions>
        <p v-if="current.status === 'cancelled'" class="drawer-tip">
          该订单已取消，积分已退回（见积分流水中「订单退款退回积分」记录）。
        </p>
      </template>
    </t-drawer>

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 订单"
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
.delta-sub {
  color: var(--td-error-color);
  font-weight: 600;
}

/* 券码等宽展示：现场核销时便于肉眼比对 */
.voucher-code {
  font-family: var(--td-font-family-mono, Consolas, monospace);
  letter-spacing: 0.5px;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.drawer-id {
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.drawer-desc {
  margin-top: 16px;
}

.drawer-tip {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
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
