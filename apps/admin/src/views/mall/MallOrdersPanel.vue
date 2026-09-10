<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { RefreshIcon, SearchIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import { cancelRedemptionOrder, fetchRedemptionOrders, finishRedemptionOrder, shipRedemptionOrder } from '@/api/mall'
import { exportCsv, statusLabel } from '@/utils/exportCsv'
import type { RedemptionOrder } from '@/types'

/* 兑换订单面板：发货 / 标记完成 / 取消（退积分回库存）+ 收件信息详情抽屉 */
const loading = ref(false)
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

const columns = [
  { colKey: 'row-select', type: 'multiple', width: 46 },
  { colKey: 'id', title: '订单编号', width: 110 },
  { colKey: 'user', title: '兑换用户', cell: 'user', width: 130 },
  { colKey: 'goodsName', title: '商品', ellipsis: true },
  { colKey: 'points', title: '兑换积分', width: 100, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'createdAt', title: '下单时间', width: 150, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 190 },
]

/* ---------- 批量发货（仅待发货订单可操作） ---------- */
const selectedKeys = ref<(string | number)[]>([])
const batchShipping = ref(false)

const shippableCount = computed(
  () => list.value.filter((o) => selectedKeys.value.includes(o.id) && o.status === 'pending_shipment').length,
)

function onSelectChange(keys: unknown) {
  selectedKeys.value = keys as (string | number)[]
}

async function onBatchShip() {
  const targets = list.value.filter((o) => selectedKeys.value.includes(o.id) && o.status === 'pending_shipment')
  if (!targets.length) {
    MessagePlugin.warning('请选择待发货的订单')
    return
  }
  batchShipping.value = true
  try {
    await Promise.all(targets.map((o) => shipRedemptionOrder(o.id)))
    MessagePlugin.success(`已批量发货 ${targets.length} 个订单`)
    selectedKeys.value = []
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '批量操作失败')
    await load()
  } finally {
    batchShipping.value = false
  }
}

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

async function load() {
  loading.value = true
  try {
    const res = await fetchRedemptionOrders({ ...query })
    list.value = res.list
    total.value = res.total
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
async function onShip(row: RedemptionOrder) {
  acting.value = `${row.id}:ship`
  try {
    await shipRedemptionOrder(row.id)
    MessagePlugin.success('订单已发货')
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
      `${o.userName}（${o.userId}）`,
      o.goodsName,
      o.points,
      statusLabel('redemption', o.status),
      o.createdAt,
      o.shippedAt ?? '—',
    ]),
  )
  MessagePlugin.success(`已导出当前页 ${list.value.length} 条数据`)
}

onMounted(load)
</script>

<template>
  <div class="orders-panel page-fade-in">
    <PageHeader title="订单管理" description="积分兑换订单的发货、完成与取消处理（原积分商城·兑换订单）">
      <template #actions>
        <t-button variant="outline" @click="onExport">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
      </template>
    </PageHeader>

    <div v-if="selectedKeys.length > 0" class="batch-bar">
      <span class="batch-tip">已选 {{ shippableCount }} 个待发货订单</span>
      <t-button theme="primary" size="small" :loading="batchShipping" @click="onBatchShip">批量发货</t-button>
      <t-button variant="text" size="small" @click="selectedKeys = []">清空选择</t-button>
    </div>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索订单编号/用户/商品"
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
        <template #icon><RefreshIcon /></template>
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
  :columns="columns"
  :loading="loading"
  :pagination="pagination"
  :selected-row-keys="selectedKeys"
  empty="暂无兑换订单"
  @select-change="onSelectChange"
  @page-change="onPageChange"
  @row-click="({ row }) => openDetail(row)"
  >
        <template #user="{ row }">
          <div class="cell-title">{{ row.userName }}</div>
          <div class="cell-sub">{{ row.userId }}</div>
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
              <t-popconfirm content="确认发货？实物商品请先核对收件信息" @confirm="onShip(row)">
                <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'ship')">
                  发货
                </t-button>
              </t-popconfirm>
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
            <t-button variant="text" size="small" @click="openDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 订单详情抽屉 -->
    <t-drawer v-model:visible="drawerVisible" header="兑换订单详情" size="480px" :footer="false">
      <template v-if="current">
        <div class="drawer-head">
          <span class="drawer-id">{{ current.id }}</span>
          <StatusTag entity="redemption" :value="current.status" />
        </div>
        <t-descriptions :column="1" bordered>
          <t-descriptions-item label="兑换用户">{{ current.userName }}（{{ current.userId }}）</t-descriptions-item>
          <t-descriptions-item label="兑换商品">{{ current.goodsName }}</t-descriptions-item>
          <t-descriptions-item label="消耗积分">{{ current.points }}</t-descriptions-item>
          <t-descriptions-item label="下单时间">{{ current.createdAt }}</t-descriptions-item>
          <t-descriptions-item v-if="current.shippedAt" label="发货时间">{{ current.shippedAt }}</t-descriptions-item>
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
  </div>
</template>

<style scoped>
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 16px;
  background: var(--td-brand-color-1);
  border: 1px solid var(--td-brand-color);
  border-radius: var(--td-radius-medium);
}

.batch-tip {
  font-size: 13px;
  color: var(--td-brand-color);
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
