<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading, Toast } from 'tdesign-mobile-vue'
import { fetchCommerceOrder, syncOrderPayment } from '@/api/commerce'
import { useAsyncList } from '@/composables/useAsyncList'
import { useServerCountdown } from '@/composables/useServerCountdown'
import { formatServerDateTime } from '@/utils/format'
import { formatFen } from '@/utils/money'
import CommerceSummaryCard from '@/components/commerce/CommerceSummaryCard.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import FlowResult from '@/components/FlowResult.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceOrder } from '@/types'

/* 支付结果：客户端回调/微信返回都不是收款凭证，统一以后端资金与履约状态为准。
 * 2s/3s/5s 退避查询，约 30s 未确认停止前台轮询；页面隐藏停止定时器，恢复可见补查一次。 */
const route = useRoute()
const router = useRouter()
const orderId = String(route.params.orderId)
const payAuth = String(route.query.payAuth ?? '')

const { data: order, loading, error, run } = useAsyncList<CommerceOrder>(() => fetchCommerceOrder(orderId))
const syncing = ref(false)
const autoStopped = ref(false)
const polling = ref(false)
const countdown = useServerCountdown(
  () => order.value?.expiresAt,
  () => order.value?.serverTime,
)

const DELAYS = [2000, 3000, 5000]
const AUTO_STOP_MS = 30_000
let timer: number | undefined
let attempt = 0
let startedAt = 0

function isTerminal(value: CommerceOrder | null): boolean {
  return Boolean(value && (value.paymentStatus === 'paid' || value.paymentStatus === 'attention' || value.paymentStatus === 'closed'))
}

function clearTimer() {
  if (timer != null) {
    window.clearTimeout(timer)
    timer = undefined
  }
  polling.value = false
}

async function refreshQuietly() {
  try {
    order.value = await fetchCommerceOrder(orderId)
  } catch {
    /* 轮询失败保留上次结果，用户可手动重试 */
  }
}

function schedule() {
  clearTimer()
  if (!order.value || isTerminal(order.value) || Date.now() - startedAt >= AUTO_STOP_MS) {
    autoStopped.value = Boolean(order.value && !isTerminal(order.value))
    return
  }
  const delay = DELAYS[Math.min(attempt, DELAYS.length - 1)]
  attempt += 1
  polling.value = true
  timer = window.setTimeout(async () => {
    if (document.visibilityState === 'hidden') {
      polling.value = false
      return
    }
    await refreshQuietly()
    schedule()
  }, delay)
}

async function startPolling() {
  startedAt = Date.now()
  attempt = 0
  autoStopped.value = false
  await refreshQuietly()
  schedule()
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    void refreshQuietly().then(() => {
      if (!isTerminal(order.value)) {
        startedAt = Date.now()
        schedule()
      }
    })
  } else {
    clearTimer()
  }
}

onMounted(async () => {
  await run()
  if (order.value && order.value.paymentStatus === 'unpaid' && order.value.expiresAt) countdown.start()
  if (payAuth === 'fail') Toast('微信授权未完成，请重试支付')
  await startPolling()
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  clearTimer()
  document.removeEventListener('visibilitychange', onVisibility)
})

const success = computed(() => Boolean(order.value && (order.value.status === 'active' || order.value.status === 'completed')))
const payingText = computed(() => {
  if (!order.value || order.value.paymentStatus === 'paid') return ''
  return polling.value ? '正在确认付款结果，请勿重复支付…' : ''
})
const pendingFulfillment = computed(() => order.value?.status === 'paid_pending')
const unpaid = computed(() => order.value?.status === 'unpaid')
const closed = computed(() => order.value?.status === 'closed')
const refunding = computed(() => order.value?.status === 'refunding')
const refunded = computed(() => order.value?.status === 'refunded')
const attention = computed(() => order.value?.status === 'attention' || order.value?.status === 'exception')

const benefitLabel = computed(() => {
  const type = order.value?.benefit?.type
  if (type === 'voucher') return '查看券码'
  if (type === 'reservation') return '查看预约'
  if (type === 'ticket') return '查看电子票'
  if (type === 'bill') return '查看租约'
  return '查看权益'
})

function goBenefit() {
  const link = order.value?.benefit?.link
  if (link) router.push(link)
  else router.push('/me/transactions')
}

async function onSync() {
  const paymentId = order.value?.latestPayment?.id
  if (!paymentId || syncing.value) return
  syncing.value = true
  try {
    order.value = await syncOrderPayment(paymentId)
    Toast('已查询最新支付结果')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '查询失败，请稍后重试')
  } finally {
    syncing.value = false
  }
}

async function onRefresh() {
  await run()
  if (order.value?.paymentStatus === 'unpaid') await startPolling()
}
</script>

<template>
  <div class="checkout-result page-fade-in">
    <ListSkeleton v-if="loading" :rows="2" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重新查询" @action="onRefresh" />
    <template v-else-if="order">
      <p v-if="payingText" class="polling" role="status" aria-live="polite">
        <Loading size="16px" aria-hidden="true" />
        <span>{{ payingText }}</span>
      </p>

      <FlowResult
        v-if="success"
        theme="success"
        title="支付成功"
        :description="`已支付 ${formatFen(order.paidFen)}。${order.benefit ? `「${order.benefit.title}」权益已可用。` : '权益已发放。'}`"
        :reference="order.id"
        :primary-text="benefitLabel"
        secondary-text="查看现金交易"
        @primary="goBenefit"
        @secondary="router.push(`/me/transactions/${order.id}`)"
      />

      <section v-else-if="pendingFulfillment" class="m-card state-card" role="status" aria-live="polite">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">已付款，正在准备权益</h2>
        <p class="state-text">资金已确认，券码/预约/电子票正在生成。请勿重复支付；稍后可从现金交易查看最新履约结果。</p>
        <p class="state-meta">实付 {{ formatFen(order.paidFen) }} · {{ formatServerDateTime(order.paidAt) }}</p>
        <Button theme="primary" size="large" block @click="router.push(`/me/transactions/${order.id}`)">查看交易</Button>
        <Button variant="outline" size="large" block @click="router.push('/me/messages')">联系运营</Button>
      </section>

      <section v-else-if="unpaid" class="m-card state-card" role="status">
        <StateTag kind="transaction" value="unpaid" />
        <h2 class="state-title">待付款</h2>
        <p class="state-text">订单尚未完成支付，请在有效期内继续付款；超时后系统会关闭订单并释放占用。</p>
        <p v-if="countdown.remainingSeconds.value > 0" class="state-meta" role="timer">剩余 {{ countdown.text.value }}</p>
        <Button theme="primary" size="large" block @click="router.replace(`/checkout/${order.id}`)">继续付款</Button>
        <Button variant="outline" size="large" block @click="router.push(`/me/transactions/${order.id}`)">查看交易</Button>
      </section>

      <section v-else-if="closed" class="m-card state-card" role="status">
        <StateTag kind="transaction" value="closed" />
        <h2 class="state-title">订单已关闭</h2>
        <p class="state-text">未在有效期内完成支付，原占用的库存/时段/名额已释放。请返回业务页面重新选择；新价格需重新确认。</p>
        <Button theme="primary" size="large" block @click="router.push(order.snapshot.sourceLink)">返回业务页面</Button>
        <Button variant="outline" size="large" block @click="router.push(`/me/transactions/${order.id}`)">查看交易</Button>
      </section>

      <section v-else-if="refunding || refunded" class="m-card state-card" role="status">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">{{ order.statusText }}</h2>
        <p class="state-text">
          {{ refunded ? `已退款 ${formatFen(order.refundedFen)}，请留意微信支付到账通知。` : '退款申请已受理，资金处理中；审核或渠道处理完成前请勿重复申请。' }}
        </p>
        <Button
          v-if="order.latestRefund"
          theme="primary"
          size="large"
          block
          @click="router.push(`/me/refunds/${order.latestRefund.id}`)"
        >查看退款进度</Button>
        <Button variant="outline" size="large" block @click="router.push(`/me/transactions/${order.id}`)">查看交易</Button>
      </section>

      <section v-else-if="attention" class="m-card state-card" role="alert">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">{{ order.statusText }}</h2>
        <p class="state-text">资金或履约结果需要人工核对。请保留订单编号联系运营，不要重新支付或生成新的收款。</p>
        <Button theme="primary" size="large" block :loading="syncing" @click="onSync">查询最新结果</Button>
        <Button variant="outline" size="large" block @click="router.push('/me/messages')">联系运营</Button>
      </section>

      <section v-else-if="order.status === 'cancelled'" class="m-card state-card" role="status">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">活动已取消</h2>
        <p class="state-text">活动已取消且报名同步失效；如已付款，可申请整单退款或联系运营处理。</p>
        <Button v-if="order.allowedActions.includes('refund')" theme="primary" size="large" block @click="router.push(`/me/transactions/${order.id}/refund`)">申请退款</Button>
        <Button variant="outline" size="large" block @click="router.push(`/me/transactions/${order.id}`)">查看交易</Button>
      </section>

      <section v-else class="m-card state-card" role="status">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">{{ order.statusText }}</h2>
        <Button theme="primary" size="large" block @click="router.push(`/me/transactions/${order.id}`)">查看交易</Button>
      </section>

      <CommerceSummaryCard
        :snapshot="order.snapshot"
        :amount-fen="order.amountFen"
        amount-label="订单金额"
        :show-amount="!success"
      />

      <div class="actions">
        <Button v-if="order.allowedActions.includes('sync')" variant="outline" block :loading="syncing" @click="onSync">查询结果</Button>
        <Button v-if="autoStopped" variant="text" block @click="onRefresh">自动查询已暂停，点此刷新</Button>
        <Button variant="text" block @click="router.push(`/me/transactions/${order.id}`)">查看交易详情</Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.checkout-result {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8);
}

.polling {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
}

.state-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  align-items: flex-start;
  padding: var(--app-space-8);
}

.state-title {
  margin: 0;
  font: var(--app-type-section);
}

.state-text {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
  overflow-wrap: anywhere;
}

.state-meta {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}
</style>
