<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import {
  archiveOrder,
  cancelRedemptionOrder,
  fetchRedemptionOrders,
  finishRedemptionOrder,
  shipRedemptionOrder,
} from '@/api/mall'
import { statusLabel } from '@/utils/exportCsv'
import type { RedemptionOrder } from '@/types'

/* 兑换订单面板：发货 / 标记完成 / 取消（退积分回库存）/ 归档 + 收件信息详情抽屉 */
const loading = ref(false)
const loadError = ref('')
const list = ref<RedemptionOrder[]>([])
const total = ref(0)
const acting = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '待发货', value: 'pending_shipment' },
  { label: '待使用', value: 'pending_use' },
  { label: '已发货', value: 'shipped' },
  { label: '已完成', value: 'finished' },
  { label: '已取消', value: 'cancelled' },
]

const dataColumns = [
  { colKey: 'id', title: '订单编号', width: 110 , ellipsis: true},
  { colKey: 'user', title: '兑换用户', cell: 'user', width: 130 , ellipsis: true},
  { colKey: 'goodsName', title: '商品', width: 200, resizable: true, ellipsis: true },
  { colKey: 'points', title: '兑换积分', width: 100, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '下单时间', width: 150, resizable: true , ellipsis: true},
  /* 操作列最宽场景为「发货 / 取消订单 / 详情」三按钮并排，需留足宽度避免换行溢出 */
  { colKey: 'op', title: '操作', cell: 'op', width: 220 },
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
  query.status = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 待发货 → 已发货 */
const shipVisible = ref(false)
const shipOrder = ref<RedemptionOrder | null>(null)
const trackingNo = ref('')

function openShip(row: RedemptionOrder) {
  shipOrder.value = row
  trackingNo.value = row.trackingNo ?? ''
  shipVisible.value = true
}

async function onShip() {
  const row = shipOrder.value
  if (!row) return
  acting.value = `${row.id}:ship`
  try {
    await shipRedemptionOrder(row.id, trackingNo.value.trim() || undefined)
    MessagePlugin.success('订单已发货')
    shipVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已发货 → 已完成 */
async function onFinish(row: RedemptionOrder) {
  acting.value = `${row.id}:finish`
  try {
    await finishRedemptionOrder(row.id)
    MessagePlugin.success('订单已标记完成')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 待发货 → 已取消（退回积分 + 回补库存） */
async function onCancel(row: RedemptionOrder) {
  acting.value = `${row.id}:cancel`
  try {
    await cancelRedemptionOrder(row.id)
    MessagePlugin.success(`订单已取消，${row.points} 积分已退回用户账户`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已完成 → 归档 */
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

/* 一键归档：按当前筛选全量拉取，归档所选状态的已完成订单 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
const bulkStatuses = [{ label: '已完成', value: 'finished' }]

function onBulkCancel() {
  bulkCancelled = true
}

async function doBulkArchive(values: string[]) {
  const targets: RedemptionOrder[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetchRedemptionOrders({ ...query, page, pageSize: 100 })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
  }
  const pending = targets.filter((o) => values.includes(o.status))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档订单')
    return
  }
  /* 进度 + 可取消：逐条执行，取消后停止后续条目（与项目/活动等一键归档口径一致） */
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: pending.length, failed: 0 }
  let done = 0
  let failed = 0
  for (const o of pending) {
    if (bulkCancelled) break
    try {
      await archiveOrder(o.id)
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
    if (done - failed > 0) MessagePlugin.success(`已归档 ${done - failed} 条订单`)
    if (failed > 0) MessagePlugin.warning(`${failed} 条订单归档失败，请重试`)
  }
  await load()
}

/* 确认前预估影响条数：按所选状态取 total（pageSize=1 仅取 total） */
function countByStatus(status: string) {
  return fetchRedemptionOrders({ ...query, status, page: 1, pageSize: 1 }).then((r) => r.total)
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

/* 履约信息可能全为空（如待发货订单）：为空时整组不渲染，避免只出现一个空标题 */
const hasFulfillment = computed(() => {
  const o = current.value
  if (!o) return false
  return !!(o.shippedAt || o.trackingNo || o.recipientName || o.address || o.voucherCode || o.voucherExpiresAt || o.usedAt)
})

/* 导出配置 */
const exportHeaders = ['编号', '用户', '商品', '积分', '状态', '创建时间', '发货时间']

function mapRow(o: RedemptionOrder): (string | number)[] {
  return [
    o.id,
    `${o.userName} [${o.userId}]`,
    o.goodsName,
    o.points,
    statusLabel('redemption', o.status),
    o.createdAt,
    o.shippedAt ?? '—',
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
    <PageHeader title="订单管理" description="积分兑换订单的发货、完成与取消处理">
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
      <t-input class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索订单编号/用户/商品…"
        clearable
        @enter="onSearch"
      />
      <t-select class="ctl-w-sm"
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
    </div>

    <div class="page-card">
      <t-table
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
        <template #status="{ row }">
          <StatusTag entity="redemption" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 待发货：发货 / 取消 -->
            <template v-if="row.status === 'pending_shipment'">
              <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'ship')" @click="openShip(row)">发货</t-button>
              <t-popconfirm content="确认取消该订单？消耗积分将退回用户账户，库存回补" @confirm="onCancel(row)">
                <t-button variant="text" size="small" theme="danger" :loading="isActing(row, 'cancel')">
                  取消订单
                </t-button>
              </t-popconfirm>
            </template>
            <!-- 已发货：标记完成 -->
            <t-popconfirm
              v-if="row.status === 'shipped'"
              content="确认该订单已完成？"
              @confirm="onFinish(row)"
            >
              <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'finish')">
                标记完成
              </t-button>
            </t-popconfirm>
            <!-- 已完成：归档 -->
            <t-popconfirm
              v-if="row.status === 'finished'"
              content="确认归档该订单？归档后可在归档管理中恢复"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="isActing(row, 'archive')">
                归档
              </t-button>
            </t-popconfirm>
            <t-button variant="text" size="small" @click="openDetail(row)">详情</t-button>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无兑换订单" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 订单详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="兑换订单详情" size="480px" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <StatusTag entity="redemption" :value="current.status" size="small" />
        </div>
        <!-- 按「订单 → 履约」分组并去掉描边：原单列 bordered 边框密度过高、两类信息混排 -->
        <t-descriptions :column="1" title="订单信息">
          <t-descriptions-item label="兑换用户">{{ current.userName }}<t-tag class="id-tag" size="small" variant="light">{{ current.userId }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="兑换商品">{{ current.goodsName }}</t-descriptions-item>
          <t-descriptions-item label="消耗积分"><span class="delta-sub">-{{ current.points }}</span></t-descriptions-item>
          <t-descriptions-item label="下单时间">{{ current.createdAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.finishedAt" label="完成时间">{{ current.finishedAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.note" label="备注">{{ current.note }}</t-descriptions-item>
        </t-descriptions>
        <t-descriptions v-if="hasFulfillment" :column="1" title="履约与收货" class="drawer-desc">
          <t-descriptions-item v-if="current.shippedAt" label="发货时间">{{ current.shippedAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.trackingNo" label="运单号">{{ current.trackingNo }}</t-descriptions-item>
          <t-descriptions-item v-if="current.recipientName" label="收件人">
            {{ current.recipientName }}<template v-if="current.recipientPhone">（{{ current.recipientPhone }}）</template>
          </t-descriptions-item>
          <t-descriptions-item v-if="current.address" label="收件地址">{{ current.address }}</t-descriptions-item>
          <t-descriptions-item v-if="current.voucherCode" label="券码">
            {{ current.voucherCode }}
            <StatusTag v-if="current.usedAt" entity="redeem" value="redeemed" class="id-tag" size="small" />
          </t-descriptions-item>
          <t-descriptions-item v-if="current.voucherExpiresAt" label="券码有效期至">{{ current.voucherExpiresAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.usedAt" label="核销时间">{{ current.usedAt }}</t-descriptions-item>
        </t-descriptions>
        <p v-if="current.status === 'cancelled'" class="drawer-tip">
          该订单已取消，积分已退回（见积分流水中「订单取消退回积分」记录）。
        </p>
      </template>
    </t-drawer>

    <t-dialog v-model:visible="shipVisible" header="订单发货" :confirm-btn="null" :cancel-btn="null" width="520px">
      <template v-if="shipOrder">
        <t-descriptions :column="1" bordered>
          <t-descriptions-item label="商品">{{ shipOrder.goodsName }}</t-descriptions-item>
          <t-descriptions-item label="收件人">{{ shipOrder.recipientName }}（{{ shipOrder.recipientPhone }}）</t-descriptions-item>
          <t-descriptions-item label="收件地址">{{ shipOrder.address }}</t-descriptions-item>
        </t-descriptions>
        <t-form label-align="top" class="ship-form">
          <t-form-item label="运单号">
            <t-input v-model="trackingNo" clearable placeholder="自提订单可留空…" />
          </t-form-item>
        </t-form>
      </template>
      <template #footer>
        <t-button variant="text" theme="default" @click="shipVisible = false">取消</t-button>
        <t-button theme="primary" :loading="!!shipOrder && isActing(shipOrder, 'ship')" @click="onShip">确认发货</t-button>
      </template>
    </t-dialog>

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

.ship-form {
  margin-top: 16px;
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
</style>
