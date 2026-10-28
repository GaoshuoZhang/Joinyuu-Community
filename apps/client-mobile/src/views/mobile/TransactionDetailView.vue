<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, CellGroup, Toast } from 'tdesign-mobile-vue'
import { cancelCommerceOrder, fetchCommerceOrder } from '@/api/commerce'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatServerDateTime } from '@/utils/format'
import { formatFen } from '@/utils/money'
import CommerceSummaryCard from '@/components/commerce/CommerceSummaryCard.vue'
import PolicySummary from '@/components/commerce/PolicySummary.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceOrder } from '@/types'

/* 现金交易详情：收款事实、业务快照、履约状态与退款记录。
 * 主操作以服务端 allowedActions 为准，页面只叠加加载/离线限制；已付款订单不提供重复支付。 */
const route = useRoute()
const router = useRouter()
const orderId = String(route.params.orderId)
const cancelling = ref(false)

async function loadOrder(): Promise<CommerceOrder> {
  try {
    return await fetchCommerceOrder(orderId)
  } catch (e) {
    if (e instanceof ApiError && e.code === 404) throw new Error('交易不存在或无权查看')
    throw e
  }
}
const { data: order, loading, error, run } = useAsyncList<CommerceOrder>(loadOrder)
onMounted(run)

const actions = computed(() => new Set(order.value?.allowedActions ?? []))
const sourceLabel = computed(() => {
  const type = order.value?.sourceType
  if (type === 'mall') return '商城'
  if (type === 'space') return '空间预约'
  if (type === 'event') return '活动报名'
  return '租约账单'
})

async function copyOrderId() {
  const id = order.value?.id
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
    Toast('订单编号已复制')
  } catch {
    Toast(`订单编号：${id}`)
  }
}

function onCancel() {
  const value = order.value
  if (!value) return
  confirmDialog({
    title: '取消订单',
    content: '取消后将关闭支付并释放已占用的库存、时段或名额。已付款订单不能在此取消。',
    cancelBtn: '再想想',
    confirmBtn: '确认取消',
    onConfirm: async () => {
      cancelling.value = true
      try {
        await cancelCommerceOrder(value.id)
        Toast('订单已关闭')
        await run()
      } catch (e) {
        Toast(e instanceof ApiError || e instanceof Error ? e.message : '取消失败，请稍后重试')
        await run()
      } finally {
        cancelling.value = false
      }
    },
  })
}
</script>

<template>
  <div class="transaction-detail page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!order" text="交易不存在或无权查看" action-text="返回现金交易" @action="router.push('/me/transactions')" />

    <template v-else>
      <section class="m-card hero">
        <div class="hero__head">
          <div class="hero__titles">
            <h2 class="hero__title">{{ order.title }}</h2>
            <p class="hero__sub">{{ sourceLabel }} · {{ order.buyerName }}</p>
          </div>
          <StateTag kind="transaction" :value="order.status" />
        </div>
        <p class="hero__amount">{{ formatFen(order.amountFen) }}</p>
        <p class="hero__status">{{ order.statusText }}</p>
      </section>

      <section class="m-card money" aria-label="金额明细">
        <dl class="money__list">
          <div class="money__row"><dt>应付金额</dt><dd>{{ formatFen(order.amountFen) }}</dd></div>
          <div class="money__row"><dt>已付金额</dt><dd>{{ formatFen(order.paidFen) }}</dd></div>
          <div v-if="order.refundedFen > 0" class="money__row"><dt>已退金额</dt><dd>{{ formatFen(order.refundedFen) }}</dd></div>
        </dl>
      </section>

      <CellGroup class="facts" :bordered="false">
        <Cell title="订单编号" :description="order.id" @click="copyOrderId" />
        <Cell title="创建时间" :description="formatServerDateTime(order.createdAt)" />
        <Cell v-if="order.paidAt" title="支付时间" :description="formatServerDateTime(order.paidAt)" />
        <Cell v-if="order.paymentStatus === 'unpaid'" title="付款截止" :description="formatServerDateTime(order.expiresAt)" />
        <Cell v-if="order.closedAt" title="关闭时间" :description="formatServerDateTime(order.closedAt)" />
      </CellGroup>

      <CommerceSummaryCard :snapshot="order.snapshot" :show-amount="false" />

      <PolicySummary :policy="order.refundPolicy" :notes="order.snapshot.notes" />

      <section v-if="order.benefit" class="m-card benefit">
        <div class="benefit__head">
          <h2 class="benefit__title">业务权益</h2>
          <StateTag
            :kind="order.benefit.type === 'voucher' ? 'order' : order.benefit.type === 'reservation' ? 'reservation' : order.benefit.type === 'ticket' ? 'ticket' : 'bill'"
            :value="order.benefit.type === 'ticket'
              ? (order.benefit.status === 'cancelled' ? 'cancelled' : order.benefit.checkedIn ? 'checked' : 'valid')
              : order.benefit.type === 'voucher' && order.benefit.status === 'finished' ? 'completed' : order.benefit.status"
          />
        </div>
        <p class="benefit__name">{{ order.benefit.title }}</p>
        <p v-if="order.benefit.voucherCode" class="benefit__meta">券码：<code translate="no">{{ order.benefit.voucherCode }}</code></p>
        <p v-if="order.benefit.date" class="benefit__meta">{{ order.benefit.date }} {{ order.benefit.startTime }}-{{ order.benefit.endTime }}</p>
        <p v-if="order.benefit.voucherExpiresAt" class="benefit__meta">
          {{ order.benefit.voucherExpiresAt ? `有效期至 ${formatServerDateTime(order.benefit.voucherExpiresAt)}` : '长期有效' }}
        </p>
        <Button v-if="order.benefit.link" variant="outline" block @click="router.push(order.benefit.link)">查看权益</Button>
      </section>

      <section v-if="order.latestRefund" class="m-card refund">
        <div class="benefit__head">
          <h2 class="benefit__title">退款</h2>
          <StateTag kind="refund" :value="order.latestRefund.status" />
        </div>
        <p class="benefit__meta">退款金额 {{ formatFen(order.latestRefund.amountFen) }} · 申请于 {{ formatServerDateTime(order.latestRefund.createdAt) }}</p>
        <Button variant="outline" block @click="router.push(`/me/refunds/${order.latestRefund.id}`)">查看退款进度</Button>
      </section>

      <section class="m-card ops">
        <Button v-if="actions.has('pay')" theme="primary" size="large" block @click="router.push(`/checkout/${order.id}`)">去付款</Button>
        <Button v-if="actions.has('refund')" theme="danger" variant="outline" size="large" block @click="router.push(`/me/transactions/${order.id}/refund`)">申请退款</Button>
        <Button v-if="actions.has('cancel')" variant="outline" size="large" block :loading="cancelling" @click="onCancel">取消订单</Button>
        <Button v-if="actions.has('contact')" variant="outline" size="large" block @click="router.push('/me/messages')">联系运营</Button>
        <p v-if="!order.refundEligible && order.refundBlockedReason && order.paymentStatus === 'paid'" class="ops__hint">
          退款说明：{{ order.refundBlockedReason }}
        </p>
        <Button variant="text" block @click="router.push('/me/transactions')">返回现金交易</Button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.transaction-detail {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8);
}

.hero {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.hero__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.hero__titles {
  min-width: 0;
}

.hero__title {
  margin: 0;
  font: var(--app-type-section);
  overflow-wrap: anywhere;
}

.hero__sub {
  margin: var(--app-space-1) 0 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
}

.hero__amount {
  margin: var(--app-space-2) 0 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-numeric-lg);
  font-variant-numeric: tabular-nums;
}

.hero__status {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.money__list {
  display: grid;
  gap: var(--app-space-3);
  margin: 0;
}

.money__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.money__row dt {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.money__row dd {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis-sm);
  font-variant-numeric: tabular-nums;
}

.facts {
  border-radius: var(--td-radius-large);
  overflow: hidden;
}

.benefit,
.refund {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.benefit__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.benefit__title {
  margin: 0;
  font: var(--app-type-emphasis);
}

.benefit__name {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-card-title);
  overflow-wrap: anywhere;
}

.benefit__meta {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.benefit__meta code {
  color: var(--td-brand-color);
  font: var(--app-type-emphasis-sm);
  letter-spacing: 0.5px;
}

.ops {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.ops__hint {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
  overflow-wrap: anywhere;
}
</style>
