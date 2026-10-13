<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon, List, TabPanel, Tabs } from 'tdesign-mobile-vue'
import { fetchMyOrders } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { useTabSwipe } from '@/composables/useTabSwipe'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { MyOrder, PageResult } from '@/types'
import StateTag from '@/components/shared/StateTag.vue'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 我的订单（统一券码兑换）：整页左右滑动切换「全部 / 未完成 / 已过期 / 已完成」（默认未完成）；
 * 未完成 = 待使用券（核销前可在详情中申请退款）。
 * 券码过期后进入「已过期」（积分由系统自动退回，可查看券码与有效期）。
 * 点击进入订单详情查看券码与二维码。 */
const router = useRouter()
/* v46：列表接口返回 { list, total }，一次取满整页，避免默认分页导致后续订单不可见 */
const { data, loading, error, run } = useAsyncList<PageResult<MyOrder>>(fetchMyOrders)
onMounted(run)

type OrderTab = 'all' | 'unfinished' | 'expired' | 'completed'
const TAB_VALUES = ['all', 'unfinished', 'expired', 'completed'] as const
const TABS: { value: OrderTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unfinished', label: '未完成' },
  { value: 'expired', label: '已过期' },
  { value: 'completed', label: '已完成' },
]
/* 默认展示未完成（券码核销主场景） */
const activeTab = ref<OrderTab>('unfinished')

const UNFINISHED_STATUSES = ['pending_use']

const orders = computed(() => data.value?.list ?? [])
const filtered = computed(() => {
  if (activeTab.value === 'all') return orders.value
  if (activeTab.value === 'completed') return orders.value.filter((order) => String(order.status) === 'completed')
  if (activeTab.value === 'expired') return orders.value.filter((order) => String(order.status) === 'expired')
  return orders.value.filter((order) => UNFINISHED_STATUSES.includes(String(order.status)))
})
const { visibleItems, hasMore, showMore } = useIncrementalList(filtered)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}

const { startSwipe, moveSwipe, cancelSwipe } = useTabSwipe(
  () => TAB_VALUES,
  () => activeTab.value,
  (value) => (activeTab.value = value as OrderTab),
)

function goDetail(order: MyOrder) {
  void router.push(`/me/orders/${order.id}`)
}
</script>

<template>
  <div
    class="m-orders page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Tabs v-model="activeTab" class="top-tabs" :swipeable="false">
      <TabPanel v-for="tab in TABS" :key="tab.value" :value="tab.value" :label="tab.label">
        <div v-if="activeTab === tab.value" class="tab-panel">
          <ListSkeleton v-if="loading && !orders.length" />
          <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
          <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
          <EmptyBlock v-else-if="!filtered.length" :text="tab.value === 'all' ? '暂无兑换订单' : `暂无${tab.label}订单`" action-text="去积分商城" @action="router.push('/mall')" />
          <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
            <p class="list-count">共 {{ formatZhNumber(filtered.length) }} 笔订单</p>
            <article
              v-for="order in visibleItems"
              :key="order.id"
              class="m-card order-card"
              v-pressable
              @click="goDetail(order)"
            >
              <div class="row">
                <h2 class="name">{{ order.goodsName }}</h2>
                <StateTag kind="order" :value="order.status" />
              </div>
              <p class="cost">{{ formatZhNumber(order.pointsCost) }} 积分</p>
              <p class="voucher">
                兑换码：<code translate="no">{{ order.voucherCode }}</code>
              </p>
              <p class="meta tabular-nums">下单时间：{{ formatLocalDateTime(order.createdAt) }}</p>
              <span class="detail-link">查看详情<Icon aria-hidden="true" name="chevron-right" size="14px" /></span>
            </article>
          </List>
        </div>
      </TabPanel>
    </Tabs>
  </div>
</template>

<style scoped>
.m-orders {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
}

.top-tabs {
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding-top: var(--app-space-6);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.order-card {
  cursor: pointer;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-5);
  margin-bottom: var(--app-space-3);
}

.name {
  margin: 0;
  flex: 1;
  min-width: 0;
  font: var(--app-type-card-title);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  margin: 0 0 var(--app-space-3);
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-brand);
}

.voucher {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  margin: 0 0 var(--app-space-3);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.voucher code {
  padding: var(--app-space-1) var(--app-space-3);
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-brand-color);
  font: var(--app-type-emphasis-sm);
  letter-spacing: 0.5px;
}

.meta {
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  align-self: flex-end;
  margin-top: var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-brand-color);
}
</style>
