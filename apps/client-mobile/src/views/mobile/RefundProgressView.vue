<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { fetchRefundRequest } from '@/api/commerce'
import { useAsyncList } from '@/composables/useAsyncList'
import { formatServerDateTime } from '@/utils/format'
import { formatFen } from '@/utils/money'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import RefundTimeline from '@/components/commerce/RefundTimeline.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceRefundRequest } from '@/types'

/* 退款进度：申请、审核、渠道处理中、成功或异常分别展示；
 * 页面关闭/请求成功都不等于退款成功，以服务端核实状态为准。 */
const route = useRoute()
const router = useRouter()
const id = String(route.params.refundRequestId)
const { data: refund, loading, error, run } = useAsyncList<CommerceRefundRequest>(() => fetchRefundRequest(id))
let timer: number | undefined

const terminal = computed(() => Boolean(refund.value && ['success', 'rejected', 'closed', 'abnormal', 'attention', 'exception'].includes(refund.value.status)))
const abnormal = computed(() => Boolean(refund.value && ['closed', 'abnormal', 'attention', 'exception'].includes(refund.value.status)))

function stopPolling() {
  if (timer != null) {
    window.clearInterval(timer)
    timer = undefined
  }
}

async function refreshQuietly() {
  try {
    refund.value = await fetchRefundRequest(id)
  } catch {
    /* 保留上次状态，用户可手动重试 */
  }
  if (terminal.value) stopPolling()
}

onMounted(async () => {
  await run()
  if (!terminal.value) {
    timer = window.setInterval(() => void refreshQuietly(), 5000)
  }
})

onBeforeUnmount(stopPolling)

function onRefresh() {
  void run().then(() => {
    if (!terminal.value) Toast('退款仍在处理中，请稍后查看')
  })
}
</script>

<template>
  <div class="refund-progress page-fade-in">
    <ListSkeleton v-if="loading" :rows="2" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />

    <template v-else-if="refund">
      <section class="m-card head">
        <div class="head__row">
          <h2 class="head__title">{{ refund.statusText }}</h2>
          <StateTag kind="refund" :value="refund.status" />
        </div>
        <p class="head__amount">退款金额 {{ formatFen(refund.amountFen) }}</p>
        <p class="head__meta">申请时间 {{ formatServerDateTime(refund.createdAt) }}</p>
        <p class="head__meta">退款申请编号 {{ refund.id }}</p>
        <p class="head__reason">原因：{{ refund.reason }}</p>
      </section>

      <section class="m-card">
        <h2 class="section-title">处理进度</h2>
        <RefundTimeline :items="refund.timeline" />
      </section>

      <section v-if="abnormal" class="m-card notice" role="alert">
        <h2 class="section-title">需要人工处理</h2>
        <p class="notice__text">渠道退款结果异常或关闭，请保留退款申请编号联系运营核对；不要重复提交申请。</p>
        <Button theme="primary" size="large" block @click="router.push('/me/messages')">联系运营</Button>
      </section>

      <section class="m-card ops">
        <Button variant="outline" size="large" block :loading="loading" @click="onRefresh">刷新进度</Button>
        <Button variant="outline" size="large" block @click="router.push(`/me/transactions/${refund.orderId}`)">查看交易详情</Button>
        <Button variant="text" block @click="router.push('/me/transactions')">返回现金交易</Button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.refund-progress {
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
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.head__title {
  margin: 0;
  font: var(--app-type-section);
}

.head__amount {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
}

.head__meta,
.head__reason {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
  overflow-wrap: anywhere;
}

.section-title {
  margin: 0 0 var(--app-space-3);
  font: var(--app-type-emphasis);
}

.notice__text {
  margin: 0 0 var(--app-space-4);
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.ops {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}
</style>
