<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { SearchIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import {
  archiveOrder,
  cancelRedemptionOrder,
  fetchRedemptionOrders,
  finishRedemptionOrder,
  shipRedemptionOrder,
} from '@/api/mall'
import { exportCsv, statusLabel } from '@/utils/exportCsv'
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
  { label: '已发货', value: 'shipped' },
  { label: '已完成', value: 'finished' },
  { label: '已取消', value: 'cancelled' },
]

const dataColumns = [
  { colKey: 'id', title: '订单编号', width: 110 , ellipsis: true},
  { colKey: 'user', title: '兑换用户', cell: 'user', width: 130 , ellipsis: true},
  { colKey: 'goodsName', title: '商品', ellipsis: true },
  { colKey: 'points', title: '兑换积分', width: 100, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '下单时间', width: 150, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 190 },
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

async function load() {
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchRedemptionOrders({ ...query })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
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
const bulkStatuses = [{ label: '已完成', value: 'finished' }]

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
  let failed = 0
  for (const o of pending) {
    try {
      await archiveOrder(o.id)
    } catch {
      failed++
    }
  }
  if (pending.length - failed > 0) MessagePlugin.success(`已归档 ${pending.length - failed} 条订单`)
  if (failed > 0) MessagePlugin.warning(`${failed} 条订单归档失败，请重试`)
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

/* 导出当前页兑换订单为 CSV */
function onExport() {
  exportCsv(
    '兑换订单列表',
    ['编号', '用户', '商品', '积分', '状态', '创建时间', '发货时间'],
    list.value.map((o) => [
      o.id,
      `${o.userName} [${o.userId}]`,
      o.goodsName,
      o.points,
      statusLabel('redemption', o.status),
      o.createdAt,
      o.shippedAt ?? '—',
    ]),
  )
  MessagePlugin.success(`已导出当前页 ${list.value.length} 条数据`)
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
        <t-button variant="outline" @click="onExport">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索订单编号/用户/商品…"
        clearable
        style="width: 240px"
        @enter="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 140px"
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
  empty="暂无兑换订单"
  @page-change="onPageChange"
  @row-click="({ row }) => openDetail(row)"
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
      </t-table>
    </div>

    <!-- 订单详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="兑换订单详情" size="480px" :footer="false" :close-btn="true" :close-on-esc-keydown="true">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <StatusTag entity="redemption" :value="current.status" />
        </div>
        <t-descriptions :column="1" bordered>
          <t-descriptions-item label="兑换用户">{{ current.userName }}<t-tag class="id-tag" size="small" variant="light">{{ current.userId }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="兑换商品">{{ current.goodsName }}</t-descriptions-item>
          <t-descriptions-item label="消耗积分">{{ current.points }}</t-descriptions-item>
          <t-descriptions-item label="下单时间">{{ current.createdAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.shippedAt" label="发货时间">{{ current.shippedAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.trackingNo" label="运单号">{{ current.trackingNo }}</t-descriptions-item>
          <t-descriptions-item v-if="current.finishedAt" label="完成时间">{{ current.finishedAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.recipientName" label="收件人">
            {{ current.recipientName }}（{{ current.recipientPhone }}）
          </t-descriptions-item>
          <t-descriptions-item v-if="current.address" label="收件地址">{{ current.address }}</t-descriptions-item>
          <t-descriptions-item v-if="current.note" label="备注">{{ current.note }}</t-descriptions-item>
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
      @confirm="onBulkConfirm"
    />
  </div>
</template>

<style scoped>
.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.delta-sub {
  color: var(--td-error-color);
  font-weight: 600;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
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

.drawer-tip {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
