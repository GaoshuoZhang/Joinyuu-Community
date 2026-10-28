<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { createCommerceOrder, fetchQuote } from '@/api/commerce'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import { useServerCountdown } from '@/composables/useServerCountdown'
import CommerceSummaryCard from '@/components/commerce/CommerceSummaryCard.vue'
import PaymentActionBar from '@/components/commerce/PaymentActionBar.vue'
import PolicySummary from '@/components/commerce/PolicySummary.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceQuote } from '@/types'

/* 确认订单：只展示后端报价快照并创建待付款订单；金额、主体权限和资源占用均由后端复核。
 * 报价过期或价格变化时后端返回冲突，本页重新读取报价状态，不按上涨后的价格静默付款。 */
const route = useRoute()
const router = useRouter()
const quoteId = String(route.query.quoteId ?? '')

const { data: quote, loading, error, run } = useAsyncList<CommerceQuote>(() => {
  if (!quoteId) return Promise.reject(new Error('报价参数缺失，请返回重新选择'))
  return fetchQuote(quoteId)
})
const submitting = ref(false)

const countdown = useServerCountdown(
  () => quote.value?.expiresAt,
  () => quote.value?.serverTime,
)

watch(quote, (value) => {
  if (value && value.status === 'open') countdown.start()
  else countdown.stop()
})

onMounted(run)

const expired = computed(() => quote.value?.status === 'expired' || (quote.value?.status === 'open' && countdown.expired.value))
const canPay = computed(() => quote.value?.status === 'open' && !expired.value && !submitting.value)

async function onConfirm() {
  const value = quote.value
  if (!value || submitting.value) return
  if (value.status === 'consumed' && value.orderId) {
    await router.replace(`/checkout/${value.orderId}`)
    return
  }
  if (!canPay.value) return
  submitting.value = true
  try {
    const order = await createCommerceOrder(value.id)
    await router.replace(`/checkout/${order.id}`)
  } catch (e) {
    Toast(e instanceof ApiError || e instanceof Error ? e.message : '创建订单失败，请稍后重试')
    await run()
  } finally {
    submitting.value = false
  }
}

function goBackToSource() {
  const link = quote.value?.snapshot.sourceLink
  if (link) router.push(link)
  else router.back()
}
</script>

<template>
  <div class="checkout-confirm page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="quote">
      <section v-if="quote.status === 'consumed' && quote.orderId" class="m-card state-card">
        <StateTag kind="transaction" value="unpaid" />
        <h2 class="state-title">订单已创建</h2>
        <p class="state-text">该报价已用于创建待付款订单，请继续完成支付。</p>
        <Button theme="primary" size="large" block @click="router.replace(`/checkout/${quote.orderId}`)">继续支付</Button>
      </section>

      <EmptyBlock
        v-else-if="expired || quote.status !== 'open'"
        text="报价已过期或已被使用，请返回重新选择并确认最新价格"
        action-text="返回重新选择"
        @action="goBackToSource"
      />

      <template v-else>
        <CommerceSummaryCard
          :snapshot="quote.snapshot"
          :amount-fen="quote.amountFen"
          amount-label="应付金额"
          :expires-text="`剩余 ${countdown.text.value}`"
        />
        <section class="m-card buyer" aria-label="购买主体">
          <span class="buyer__label">购买/预约主体</span>
          <span class="buyer__value">{{ quote.buyerName }}</span>
        </section>
        <PolicySummary :policy="quote.snapshot.refundPolicy" :notes="quote.snapshot.notes" />
        <p class="hint">请在报价有效期内确认；价格或资源状态变化时需重新确认，不会按新价格自动付款。</p>
        <PaymentActionBar
          :amount-fen="quote.amountFen"
          :label="submitting ? '正在创建订单…' : '确认并支付'"
          :loading="submitting"
          :disabled="!canPay"
          :hint="countdown.expired.value ? '报价已过期，请返回重新选择' : ''"
          @primary="onConfirm"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.checkout-confirm {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8);
  padding-bottom: calc(var(--app-action-bar-clearance-lg) + env(safe-area-inset-bottom));
}

.state-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  align-items: flex-start;
}

.state-title {
  margin: 0;
  font: var(--app-type-section);
}

.state-text {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.buyer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.buyer__label {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.buyer__value {
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis-sm);
  overflow-wrap: anywhere;
  text-align: right;
}

.hint {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
}
</style>
