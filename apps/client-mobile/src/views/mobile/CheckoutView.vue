<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, CellGroup, Toast } from 'tdesign-mobile-vue'
import { cancelCommerceOrder, fetchCommerceOrder, fetchPaymentCapabilities } from '@/api/commerce'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import { usePayment } from '@/composables/usePayment'
import { useServerCountdown } from '@/composables/useServerCountdown'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatServerDateTime } from '@/utils/format'
import { paymentMethodLabel } from '@/utils/paymentEnvironment'
import CommerceSummaryCard from '@/components/commerce/CommerceSummaryCard.vue'
import PaymentActionBar from '@/components/commerce/PaymentActionBar.vue'
import PolicySummary from '@/components/commerce/PolicySummary.vue'
import QrCodeDialog from '@/components/commerce/QrCodeDialog.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceCapabilities, CommerceOrder, CommercePayMethod } from '@/types'

/* 统一收银台：商户 → 摘要 → 主体 → 金额 → 退款约定 → 截止时间 → 支付方式 → 主操作。
 * 首期仅微信；JSAPI/H5/Native 的选择由后端 capabilities 与环境决定，客户端不伪造收款方式。
 * 发起中禁止重复提交；取消支付后只回到本页核对原单，不自动重建订单。 */
const route = useRoute()
const router = useRouter()
const orderId = String(route.params.orderId)

const { data: order, loading, error, run } = useAsyncList<CommerceOrder>(() => fetchCommerceOrder(orderId))
const capabilities = ref<CommerceCapabilities | null>(null)
const capsLoading = ref(false)
const capsError = ref('')
const cancelling = ref(false)
const qrVisible = ref(false)
const qrCodeUrl = ref('')
const { busy: paying, pay } = usePayment()

const countdown = useServerCountdown(
  () => order.value?.expiresAt,
  () => order.value?.serverTime,
)

watch(order, (value) => {
  if (value && value.paymentStatus === 'unpaid' && value.expiresAt) countdown.start()
  else countdown.stop()
})

async function loadCapabilities() {
  capsLoading.value = true
  capsError.value = ''
  try {
    capabilities.value = await fetchPaymentCapabilities()
  } catch (e) {
    capsError.value = e instanceof Error ? e.message : '支付方式加载失败'
  } finally {
    capsLoading.value = false
  }
}

onMounted(async () => {
  await run()
  await loadCapabilities()
})

const method = computed<CommercePayMethod | null>(() => capabilities.value?.wechat.methods[0] ?? null)
const unavailable = computed(() => capabilities.value?.wechat.unavailableReason ?? capsError.value)
const isPayable = computed(() => {
  const value = order.value
  return Boolean(value && value.paymentStatus === 'unpaid' && value.status === 'unpaid' && value.expiresAt)
})
const expired = computed(() => Boolean(isPayable.value && countdown.expired.value))
const needsAuthorization = computed(() => method.value === 'jsapi' && capabilities.value?.wechat.jsapiAuthorized === false)
const payLabel = computed(() => {
  if (paying.value) return '正在发起支付…'
  if (!method.value) return '暂不可支付'
  if (needsAuthorization.value) return '微信授权并支付'
  return paymentMethodLabel(method.value)
})
const payHint = computed(() => {
  if (expired.value) return '付款时间已结束，请重新下单或联系运营'
  if (unavailable.value) return unavailable.value
  if (needsAuthorization.value) return '将先跳转微信网页授权，授权后返回本页继续支付'
  if (method.value === 'native') return '请使用手机微信扫一扫完成付款，页面会持续查询结果'
  return countdown.remainingSeconds.value > 0 ? `剩余支付时间 ${countdown.text.value}` : ''
})
const paid = computed(() => order.value?.paymentStatus === 'paid')
const terminal = computed(() => Boolean(order.value && (order.value.paymentStatus === 'closed' || order.value.paymentStatus === 'attention')))

async function onPay() {
  const value = order.value
  if (!value || !method.value || paying.value || !isPayable.value || expired.value) return
  const result = await pay(value, method.value)
  if (result.status === 'qr') {
    qrCodeUrl.value = result.codeUrl
    qrVisible.value = true
    return
  }
  if (result.status === 'error') {
    Toast(result.message)
    return
  }
  if (result.status === 'authorizing' || result.status === 'redirect') return
  if (result.status === 'cancel') Toast('已取消支付，正在核对原订单状态')
  else if (result.status === 'fail') Toast('支付未完成，正在核对原订单状态')
  await router.replace(`/checkout/${orderId}/result`)
}

function onQrVisible(value: boolean) {
  qrVisible.value = value
  if (!value) void router.replace(`/checkout/${orderId}/result`)
}

function onCancelOrder() {
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

const sourceLink = computed(() => order.value?.snapshot.sourceLink ?? '/me/transactions')
</script>

<template>
  <div class="checkout page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="order">
      <section v-if="paid" class="m-card state-card" role="status">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">{{ order.statusText }}</h2>
        <p class="state-text">该订单已完成付款，请查看支付结果与权益状态。</p>
        <Button theme="primary" size="large" block @click="router.replace(`/checkout/${orderId}/result`)">查看支付结果</Button>
      </section>

      <section v-else-if="terminal" class="m-card state-card" role="status">
        <StateTag kind="transaction" :value="order.status" />
        <h2 class="state-title">{{ order.statusText }}</h2>
        <p class="state-text">当前订单不能再发起支付。请核对原交易或联系运营处理，不要生成新的付款。</p>
        <Button theme="primary" size="large" block @click="router.push(`/checkout/${orderId}/result`)">查看结果</Button>
        <Button variant="outline" size="large" block @click="router.push(`/me/transactions/${orderId}`)">查看交易详情</Button>
      </section>

      <template v-else>
        <header class="merchant">
          <span class="merchant__label">收款方</span>
          <strong class="merchant__name">{{ capabilities?.wechat.merchantName || '社区在线收款' }}</strong>
        </header>

        <CommerceSummaryCard
          :snapshot="order.snapshot"
          :amount-fen="order.amountFen"
          amount-label="应付金额"
          :expires-text="countdown.remainingSeconds.value > 0 ? `剩余 ${countdown.text.value}` : ''"
        />

        <CellGroup class="facts" :bordered="false">
          <Cell title="购买/预约主体" :description="order.buyerName" />
          <Cell title="付款截止" :description="formatServerDateTime(order.expiresAt)" />
          <Cell title="订单编号" :description="order.id" />
        </CellGroup>

        <PolicySummary :policy="order.refundPolicy" :notes="order.snapshot.notes" />

        <section class="m-card method" aria-label="支付方式">
          <h2 class="method__title">支付方式</h2>
          <div v-if="capsLoading" class="method__state">正在检查可用支付方式…</div>
          <div v-else-if="method" class="method__option" role="radio" aria-checked="true" tabindex="0">
            <span class="method__icon" aria-hidden="true">微</span>
            <span class="method__name">微信支付</span>
            <span class="method__badge">推荐</span>
          </div>
          <p v-else class="method__state">{{ unavailable || '当前环境暂不支持在线支付，请更换微信或手机浏览器访问。' }}</p>
        </section>

        <div class="links">
          <Button variant="text" block @click="router.push(`/me/transactions/${orderId}`)">稍后处理，查看现金交易</Button>
          <Button variant="text" block :loading="cancelling" @click="onCancelOrder">取消订单</Button>
          <Button variant="text" block @click="router.push(sourceLink)">返回业务页面</Button>
        </div>

        <PaymentActionBar
          :amount-fen="order.amountFen"
          :label="payLabel"
          :loading="paying"
          :disabled="!method || capsLoading || expired || !isPayable"
          :hint="payHint"
          @primary="onPay"
        />
      </template>
    </template>

    <QrCodeDialog
      :visible="qrVisible"
      :code-url="qrCodeUrl"
      :amount-fen="order?.amountFen ?? 0"
      :expires-text="countdown.text.value"
      @update:visible="onQrVisible"
    />
  </div>
</template>

<style scoped>
.checkout {
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

.merchant {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.merchant__label {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.merchant__name {
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis);
  overflow-wrap: anywhere;
  text-align: right;
}

.facts {
  margin: 0;
  border-radius: var(--td-radius-large);
  overflow: hidden;
}

.method {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.method__title {
  margin: 0;
  font: var(--app-type-emphasis);
}

.method__option {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  padding: var(--app-space-4);
  border: 1px solid var(--td-brand-color);
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color-1);
}

.method__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #07c160;
  color: #fff;
  font: var(--app-type-emphasis-xs);
}

.method__name {
  flex: 1;
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis-sm);
}

.method__badge {
  color: var(--td-brand-color);
  font: var(--app-type-caption);
}

.method__state {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
  overflow-wrap: anywhere;
}

.links {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-1);
}
</style>
