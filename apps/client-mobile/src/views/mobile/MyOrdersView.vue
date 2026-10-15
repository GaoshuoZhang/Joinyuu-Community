<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, List, TabPanel, Tabs } from 'tdesign-mobile-vue'
import { fetchMyOrders } from '@/api/mall'
import { usePagedList } from '@/composables/usePagedList'
import { useTabSwipe } from '@/composables/useTabSwipe'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { MyOrder } from '@/types'
import StateTag from '@/components/shared/StateTag.vue'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 我的订单（统一券码兑换）：整页左右滑动切换「全部 / 未完成 / 已过期 / 已完成」（默认未完成）；
 * 未完成 = 待使用券（核销前可在详情中申请退款）。
 * 券码过期后进入「已过期」（积分由系统自动退回，可查看券码与有效期）。
 * 点击进入订单详情查看券码与二维码。 */
const router = useRouter()
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

const statusForTab = computed(() => ({ all: '', unfinished: 'pending_use', expired: 'expired', completed: 'completed' })[activeTab.value])
const { items: orders, total, loading, error, moreError, loadingMore, hasMore, refresh, loadMore } = usePagedList<MyOrder>(
  (page, pageSize) => fetchMyOrders({ page, pageSize, status: statusForTab.value || undefined }),
)
watch(activeTab, () => void refresh(), { immediate: true })
const visibleItems = orders
const footerState = computed(() => (loadingMore.value ? 'loading' : hasMore.value ? 'load-more' : ''))
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}

const { startSwipe, moveSwipe, cancelSwipe } = useTabSwipe(
  () => TAB_VALUES,
  () => activeTab.value,
  (value) => (activeTab.value = value as OrderTab),
)
</script>

<template>
  <div
    class="m-orders page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Tabs :data-tab-values="JSON.stringify(TABS.map((tab) => tab.value))" v-model="activeTab" class="top-tabs" :swipeable="false">
      <TabPanel v-for="tab in TABS" :key="tab.value" :data-tab-value="tab.value" :value="tab.value" :label="tab.label">
        <div v-if="activeTab === tab.value" class="tab-panel">
          <ListSkeleton v-if="loading && !orders.length" />
          <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="refresh" />
          <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
          <EmptyBlock v-else-if="!orders.length && !loading" :text="tab.value === 'all' ? '暂无兑换订单' : `暂无${tab.label}订单`" action-text="去积分商城" @action="router.push('/mall')" />
          <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
            <p class="list-count">共 {{ formatZhNumber(total) }} 笔订单</p>
            <!-- v52：跳转型整卡按 wiki §5 口径用 router-link 承载主体（支持 Ctrl/中键新标签、读屏播报为链接）；
                 「查看详情」为卡内视觉提示，不再是嵌套链接 -->
            <router-link
              v-for="order in visibleItems"
              :key="order.id"
              class="m-card order-card pressable"
              :to="`/me/orders/${order.id}`"
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
            </router-link>
            <Button v-if="moreError" block variant="outline" @click="loadMore">加载失败，点击重试</Button>
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
  display: block;
  color: inherit;
  text-decoration: none;
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
