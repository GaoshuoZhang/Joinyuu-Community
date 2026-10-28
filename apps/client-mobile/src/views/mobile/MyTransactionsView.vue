<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, CheckTag, Icon, List, TabPanel, Tabs } from 'tdesign-mobile-vue'
import { fetchTransactionSummary, fetchTransactions } from '@/api/commerce'
import { usePagedList } from '@/composables/usePagedList'
import { useTabSwipe } from '@/composables/useTabSwipe'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceOrder, CommerceSourceType, CommerceTransactionSummary } from '@/types'
import { formatServerDateTime } from '@/utils/format'
import { formatFen } from '@/utils/money'

/* 我的现金交易：统一承载付款与售后状态；业务权益仍从券码/预约/报名/租约进入。
 * 「待付款」只列仍在支付窗口内的订单；超时未付进入全部/已关闭，资源由后端释放。 */
const router = useRouter()
type Tab = 'all' | 'unpaid' | 'active' | 'completed' | 'refund'
const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unpaid', label: '待付款' },
  { value: 'active', label: '待使用' },
  { value: 'completed', label: '已完成' },
  { value: 'refund', label: '退款/售后' },
]
const TAB_VALUES = TABS.map((tab) => tab.value)
const activeTab = ref<Tab>('all')

type SourceFilter = 'all' | CommerceSourceType
const SOURCES: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: '全部业务' },
  { value: 'mall', label: '商城' },
  { value: 'space', label: '空间' },
  { value: 'event', label: '活动' },
  { value: 'lease_bill', label: '租约' },
]
const sourceFilter = ref<SourceFilter>('all')

const summary = ref<CommerceTransactionSummary | null>(null)
const { items, total, loading, error, moreError, loadingMore, hasMore, refresh, loadMore } = usePagedList<CommerceOrder>(
  (page, pageSize) => fetchTransactions({
    page,
    pageSize,
    status: activeTab.value,
    sourceType: sourceFilter.value === 'all' ? undefined : sourceFilter.value,
  }),
)
watch([activeTab, sourceFilter], () => void refresh(), { immediate: true })
const footerState = computed(() => (loadingMore.value ? 'loading' : hasMore.value ? 'load-more' : ''))

const { startSwipe, moveSwipe, cancelSwipe } = useTabSwipe(
  () => TAB_VALUES,
  () => activeTab.value,
  (value) => (activeTab.value = value as Tab),
)

onMounted(async () => {
  try {
    summary.value = await fetchTransactionSummary()
  } catch {
    summary.value = null
  }
})

function sourceLabel(source: CommerceSourceType): string {
  if (source === 'mall') return '商城'
  if (source === 'space') return '空间预约'
  if (source === 'event') return '活动报名'
  return '租约账单'
}

function canPay(item: CommerceOrder): boolean {
  return item.allowedActions.includes('pay')
}
</script>

<template>
  <div
    class="m-transactions page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <section v-if="summary" class="summary-bar" aria-label="交易待办">
      <router-link v-if="summary.pendingPayment" class="summary-item" to="/me/transactions">
        <strong>{{ summary.pendingPayment }}</strong>
        <span>待付款</span>
      </router-link>
      <router-link v-if="summary.refunding" class="summary-item" to="/me/transactions">
        <strong>{{ summary.refunding }}</strong>
        <span>退款处理中</span>
      </router-link>
      <router-link v-if="summary.unpaidBills" class="summary-item" to="/me/bills">
        <strong>{{ summary.unpaidBills }}</strong>
        <span>待缴账单</span>
      </router-link>
      <p v-if="!summary.pendingPayment && !summary.refunding && !summary.unpaidBills" class="summary-empty">暂无待付款或待缴事项</p>
    </section>

    <Tabs v-model="activeTab" class="top-tabs" :swipeable="false">
      <TabPanel v-for="tab in TABS" :key="tab.value" :value="tab.value" :label="tab.label">
        <div v-if="activeTab === tab.value" class="tab-panel">
          <div class="chips">
            <CheckTag
              v-for="source in SOURCES"
              :key="source.value"
              variant="light"
              size="medium"
              :checked="sourceFilter === source.value"
              @change="sourceFilter = source.value"
            >{{ source.label }}</CheckTag>
          </div>

          <ListSkeleton v-if="loading && !items.length" />
          <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="refresh" />
          <EmptyBlock v-else-if="!items.length" text="暂无现金交易记录" action-text="去商城看看" @action="router.push('/mall')" />
          <List v-else class="list stagger" :async-loading="footerState" @load-more="loadMore">
            <p class="list-count">共 {{ total }} 笔交易</p>
            <article v-for="item in items" :key="item.id" class="m-card transaction-card">
              <router-link class="card-main" :to="`/me/transactions/${item.id}`">
                <div class="card-head">
                  <h2 class="card-title">{{ item.title }}</h2>
                  <StateTag kind="transaction" :value="item.status" />
                </div>
                <p class="card-sub">{{ sourceLabel(item.sourceType) }} · {{ item.buyerName }}</p>
                <p class="card-amount">{{ formatFen(item.amountFen) }}</p>
                <p class="card-meta">
                  {{ formatServerDateTime(item.createdAt) }}
                  <template v-if="item.status === 'unpaid'"> · 截止 {{ formatServerDateTime(item.expiresAt) }}</template>
                  <template v-else-if="item.paidAt"> · 支付 {{ formatServerDateTime(item.paidAt) }}</template>
                </p>
                <span class="detail-link">查看详情<Icon aria-hidden="true" name="chevron-right" size="14px" /></span>
              </router-link>
              <div v-if="canPay(item)" class="card-ops">
                <Button theme="primary" size="small" block @click="router.push(`/checkout/${item.id}`)">去付款</Button>
              </div>
            </article>
            <Button v-if="moreError" block variant="outline" @click="loadMore">加载失败，点击重试</Button>
          </List>
        </div>
      </TabPanel>
    </Tabs>
  </div>
</template>

<style scoped>
.m-transactions {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: var(--app-space-8);
}

.summary-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-4);
  padding: var(--app-space-5);
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color-1);
}

.summary-item {
  display: inline-flex;
  align-items: baseline;
  gap: var(--app-space-1);
  color: var(--td-text-color-primary);
  text-decoration: none;
  font: var(--app-type-body-sm);
}

.summary-item strong {
  color: var(--td-brand-color);
  font: var(--app-type-numeric);
}

.summary-empty {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.top-tabs {
  --td-tab-nav-background: transparent;
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding-top: var(--app-space-5);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.transaction-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.card-main {
  display: block;
  color: inherit;
  text-decoration: none;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.card-title {
  margin: 0;
  min-width: 0;
  font: var(--app-type-card-title);
  overflow-wrap: anywhere;
}

.card-sub {
  margin: var(--app-space-2) 0 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
}

.card-amount {
  margin: var(--app-space-2) 0 0;
  color: var(--td-text-color-brand);
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
}

.card-meta {
  margin: var(--app-space-2) 0 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
  font-variant-numeric: tabular-nums;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  margin-top: var(--app-space-3);
  color: var(--td-brand-color);
  font: var(--app-type-body-sm);
}

.card-ops {
  display: flex;
  justify-content: flex-end;
}
</style>
