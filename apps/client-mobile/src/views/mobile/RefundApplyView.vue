<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Toast, Textarea } from 'tdesign-mobile-vue'
import { fetchCommerceOrder, requestOrderRefund } from '@/api/commerce'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import { confirmDialog } from '@/utils/confirmDialog'
import { formatServerDateTime } from '@/utils/format'
import { formatFen } from '@/utils/money'
import PolicySummary from '@/components/commerce/PolicySummary.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceOrder } from '@/types'

/* 申请退款：首期仅整单全额退款，沿用后台异人审批；客户端不修改金额、不审批资金终态。
 * 资格以服务端为准（已使用/已签到/已开始/已过期等不可申请），页面只展示原因。 */
const route = useRoute()
const router = useRouter()
const orderId = String(route.params.orderId)
const { data: order, loading, error, run } = useAsyncList<CommerceOrder>(() => fetchCommerceOrder(orderId))
const reason = ref('')
const submitting = ref(false)

onMounted(run)

const eligible = computed(() => Boolean(order.value && order.value.paymentStatus === 'paid' && order.value.refundEligible))
const blockedReason = computed(() => {
  if (!order.value) return ''
  if (order.value.paymentStatus !== 'paid') return '仅已支付订单可申请退款'
  if (!order.value.refundEligible) return order.value.refundBlockedReason || '当前订单不满足退款条件'
  if (order.value.afterSalesStatus !== 'none' && order.value.afterSalesStatus !== 'rejected') return '退款申请正在处理中'
  return ''
})

function submit() {
  const value = order.value
  if (!value || !eligible.value || submitting.value) return
  const text = reason.value.trim()
  if (text.length < 2) {
    Toast('请填写退款原因（至少 2 个字）')
    return
  }
  confirmDialog({
    title: '提交退款申请',
    content: `将申请整单全额退款 ${formatFen(value.amountFen)}。提交后需运营审核，审核通过后由微信原路退回；审核期间相关权益会被冻结。`,
    cancelBtn: '再想想',
    confirmBtn: '提交申请',
    onConfirm: async () => {
      submitting.value = true
      try {
        const refund = await requestOrderRefund(value.id, text)
        Toast('退款申请已提交')
        await router.replace(`/me/refunds/${refund.id}`)
      } catch (e) {
        Toast(e instanceof ApiError || e instanceof Error ? e.message : '提交失败，请稍后重试')
        await run()
      } finally {
        submitting.value = false
      }
    },
  })
}
</script>

<template>
  <div class="refund-apply page-fade-in">
    <ListSkeleton v-if="loading" :rows="2" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />

    <template v-else-if="order">
      <section class="m-card head">
        <div class="head__row">
          <h2 class="head__title">{{ order.title }}</h2>
          <StateTag kind="transaction" :value="order.status" />
        </div>
        <p class="head__amount">可退金额 {{ formatFen(order.amountFen) }}</p>
        <p class="head__meta">支付时间 {{ formatServerDateTime(order.paidAt) }} · 订单 {{ order.id }}</p>
      </section>

      <EmptyBlock
        v-if="!eligible"
        :text="blockedReason"
        action-text="查看交易"
        @action="router.push(`/me/transactions/${order.id}`)"
      />

      <template v-else>
        <PolicySummary :policy="order.refundPolicy" :notes="order.snapshot.notes" />
        <section class="m-card form">
          <label class="form__label" for="refund-reason">退款原因</label>
          <Textarea
            id="refund-reason"
            v-model="reason"
            :maxlength="80"
            :autosize="{ minRows: 4, maxRows: 6 }"
            placeholder="请说明退款原因（必填，最多 80 字）"
            aria-required="true"
          />
          <p class="form__hint">首期仅支持整单全额退款；审核通过后按原支付方式退回，到账时间以微信为准。</p>
        </section>
        <section class="m-card notice">
          <h3 class="notice__title">提交后会发生什么</h3>
          <ol class="notice__list">
            <li>相关券码、预约或报名权益会被冻结，审核期间不能核销、签到或取消。</li>
            <li>运营审核通过后提交微信退款；审核未通过则权益恢复可用。</li>
            <li>页面展示的“申请已提交”不等于退款成功，最终以服务端核实结果为准。</li>
          </ol>
        </section>
        <Button theme="primary" size="large" block :loading="submitting" @click="submit">提交退款申请</Button>
        <Button variant="text" block @click="router.push(`/me/transactions/${order.id}`)">返回交易详情</Button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.refund-apply {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8);
}

.head {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.head__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.head__title {
  margin: 0;
  min-width: 0;
  font: var(--app-type-card-title);
  overflow-wrap: anywhere;
}

.head__amount {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
}

.head__meta {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
  overflow-wrap: anywhere;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.form__label {
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis-sm);
}

.form__hint {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
}

.notice__title {
  margin: 0 0 var(--app-space-3);
  font: var(--app-type-emphasis-sm);
}

.notice__list {
  margin: 0;
  padding-left: var(--app-space-5);
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}
</style>
