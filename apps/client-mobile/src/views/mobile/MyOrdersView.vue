<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, TabPanel, Tabs } from 'tdesign-mobile-vue'
import { fetchMyOrders } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { useTabSwipe } from '@/composables/useTabSwipe'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { MyOrder } from '@/types'
import StateTag from '@/components/shared/StateTag.vue'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 我的订单：整页左右滑动切换「全部 / 未完成 / 已过期 / 已完成」（默认未完成）；
 * 未完成含数字券与实物订单（发货后仍留在未完成，确认收货后转入已完成）。
 * 权益券过期后进入「已过期」（不可核销，可查看券码与有效期）。
 * 点击进入订单详情查看券码与二维码。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyOrders)
onMounted(run)

type OrderTab = 'all' | 'unfinished' | 'expired' | 'completed'
const TAB_VALUES = ['all', 'unfinished', 'expired', 'completed'] as const
const TABS: { value: OrderTab; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unfinished', label: '未完成' },
  { value: 'expired', label: '已过期' },
  { value: 'completed', label: '已完成' },
]
/* 默认展示未完成（券码核销与待收货主场景） */
const activeTab = ref<OrderTab>('unfinished')

const UNFINISHED_STATUSES = ['pending_use', 'pending_shipment', 'shipped']

const orders = computed(() => data.value ?? [])
const filtered = computed(() => {
  if (activeTab.value === 'all') return orders.value
  if (activeTab.value === 'completed') return orders.value.filter((order) => String(order.status) === 'completed')
  if (activeTab.value === 'expired') return orders.value.filter((order) => String(order.status) === 'expired')
  return orders.value.filter((order) => UNFINISHED_STATUSES.includes(String(order.status)))
})
const { visibleItems, hasMore, showMore } = useIncrementalList(filtered)

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
          <EmptyBlock v-else-if="!filtered.length" :text="tab.value === 'all' ? '暂无兑换订单' : `暂无${tab.label}订单`" />
          <template v-else>
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
              <p v-if="order.voucherCode" class="voucher">
                兑换码：<code translate="no">{{ order.voucherCode }}</code>
              </p>
              <p v-else-if="order.trackingNo" class="meta">物流单号：{{ order.trackingNo }}</p>
              <p class="meta">下单时间：{{ formatLocalDateTime(order.createdAt) }}</p>
              <span class="detail-link">查看详情<Icon aria-hidden="true" name="chevron-right" size="14px" /></span>
            </article>
            <Button v-if="hasMore" block variant="outline" @click="showMore">
              加载更多（剩余 {{ formatZhNumber(filtered.length - visibleItems.length) }} 笔）
            </Button>
          </template>
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

.list-count {
  margin: 0 2px;
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
  font-size: var(--app-font-body);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  margin: 0 0 var(--app-space-3);
  font-variant-numeric: tabular-nums;
  font-size: var(--app-font-body);
  font-weight: 600;
  color: var(--td-brand-color);
}

.voucher {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  margin: 0 0 var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.voucher code {
  padding: var(--app-space-1) var(--app-space-3);
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-brand-color);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.meta {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  align-self: flex-end;
  margin-top: var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
}
</style>
