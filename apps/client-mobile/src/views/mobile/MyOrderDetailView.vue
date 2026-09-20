<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Popup, QRCode, Rate, Textarea, Toast } from 'tdesign-mobile-vue'
import { cancelOrder, confirmOrder, fetchMyOrders, reviewOrder, useOrder } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { MyOrder } from '@/types'
import StateTag from '@/components/shared/StateTag.vue'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDateTime, formatZhNumber, parseLocalDateTime } from '@/utils/format'

/* 订单详情：待使用的券码展示兑换码与二维码（参考活动签到电子票），并支持核销/收货/取消/评价。 */
const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const businessNowMs = useBusinessNow()
const { data, loading, error, run } = useAsyncList(fetchMyOrders)
onMounted(run)

const order = computed(() => (data.value ?? []).find((item) => item.id === id))

function isExpired(item: MyOrder): boolean {
  if (String(item.status) === 'expired') return true
  const expiresAt = item.voucherExpiresAt ? parseLocalDateTime(item.voucherExpiresAt) : null
  return expiresAt ? expiresAt.getTime() < businessNowMs.value : false
}

const canUse = computed(() => !!order.value && String(order.value.status) === 'pending_use' && !isExpired(order.value))

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    Toast('兑换码已复制')
  } catch {
    Toast(`兑换码：${code}`)
  }
}

const acting = ref(false)

function onUse() {
  const item = order.value
  if (!item) return
  DialogPlugin.confirm({
    title: '使用卡券',
    content: `确认已使用「${item.goodsName}」？使用后订单将完成。`,
    cancelBtn: '取消',
    confirmBtn: '确认使用',
    onConfirm: () => void doUse(item),
  })
}

async function doUse(item: MyOrder) {
  acting.value = true
  try {
    await useOrder(item.id)
    Toast('卡券已使用')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '使用失败，请稍后重试')
  } finally {
    acting.value = false
  }
}

function onConfirmReceipt() {
  const item = order.value
  if (!item) return
  DialogPlugin.confirm({
    title: '确认收货',
    content: `确认已收到「${item.goodsName}」？确认后订单将完成。`,
    cancelBtn: '取消',
    confirmBtn: '确认收货',
    onConfirm: async () => {
      acting.value = true
      try {
        await confirmOrder(item.id)
        Toast('已确认收货')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
      } finally {
        acting.value = false
      }
    },
  })
}

function onCancelOrder() {
  const item = order.value
  if (!item) return
  DialogPlugin.confirm({
    title: '取消兑换',
    content: `取消后 ${formatZhNumber(item.pointsCost)} 积分将退回，库存恢复。确认取消？`,
    cancelBtn: '再想想',
    confirmBtn: '确认取消',
    onConfirm: async () => {
      acting.value = true
      try {
        await cancelOrder(item.id)
        Toast('订单已取消，积分已退回')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
      } finally {
        acting.value = false
      }
    },
  })
}

/* ---- 评价 ---- */
const reviewVisible = ref(false)
const reviewRating = ref(5)
const reviewText = ref('')
const reviewing = ref(false)

function openReview() {
  reviewRating.value = order.value?.rating ?? 5
  reviewText.value = order.value?.review ?? ''
  reviewVisible.value = true
}

async function onReviewSubmit() {
  const item = order.value
  if (!item) return
  reviewing.value = true
  try {
    await reviewOrder(item.id, reviewRating.value, reviewText.value)
    Toast('评价已提交')
    reviewVisible.value = false
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '评价失败，请稍后重试')
  } finally {
    reviewing.value = false
  }
}
</script>

<template>
  <div class="m-order-detail page-fade-in">
    <ListSkeleton v-if="loading" :rows="2" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!order" text="订单不存在或已删除" action-text="返回我的订单" @action="router.push('/me/orders')" />

    <template v-else>
      <section class="m-card ticket-card" :class="{ invalid: !canUse }">
        <div class="head">
          <h2 class="name">{{ order.goodsName }}</h2>
          <StateTag kind="order" :value="order.status" />
        </div>
        <p class="cost">{{ formatZhNumber(order.pointsCost) }} 积分</p>

        <template v-if="order.voucherCode">
          <div v-if="canUse" class="qr-wrap">
            <QRCode :value="order.voucherCode" :size="140" level="M" aria-label="卡券核销二维码" />
          </div>
          <p class="code">兑换码：<code translate="no">{{ order.voucherCode }}</code></p>
          <p v-if="order.voucherExpiresAt" class="expiry">
            {{ isExpired(order) ? `已于 ${formatLocalDateTime(order.voucherExpiresAt)} 过期` : `有效期至 ${formatLocalDateTime(order.voucherExpiresAt)}` }}
          </p>
          <p v-if="!canUse" class="hint">
            {{ String(order.status) === 'completed' ? '该卡券已核销' : isExpired(order) ? '该卡券已过期，无法核销' : '该卡券已取消' }}
          </p>
        </template>

        <template v-else>
          <p v-if="order.recipientAddress" class="info">收货：{{ order.recipientName }} {{ order.recipientPhone }} · {{ order.recipientAddress }}</p>
          <p v-if="order.trackingNo" class="info">物流单号：{{ order.trackingNo }}</p>
        </template>

        <div class="times">
          <p>下单时间：{{ formatLocalDateTime(order.createdAt) }}</p>
          <p v-if="order.shippedAt">发货时间：{{ formatLocalDateTime(order.shippedAt) }}</p>
          <p v-if="order.usedAt">使用时间：{{ formatLocalDateTime(order.usedAt) }}</p>
          <p v-if="order.finishedAt">完成时间：{{ formatLocalDateTime(order.finishedAt) }}</p>
        </div>
      </section>

      <section class="m-card ops">
        <Button v-if="canUse" theme="primary" block :loading="acting" @click="onUse">立即使用</Button>
        <Button v-if="canUse && order.voucherCode" variant="outline" block @click="copyCode(order.voucherCode)">
          <template #icon><Icon aria-hidden="true" name="copy" size="16px" /></template>
          复制兑换码
        </Button>
        <Button v-if="order.status === 'shipped'" theme="primary" block :loading="acting" @click="onConfirmReceipt">确认收货</Button>
        <Button v-if="order.status === 'pending_shipment'" variant="outline" block :loading="acting" @click="onCancelOrder">取消兑换</Button>
        <template v-if="order.status === 'completed'">
          <Button v-if="!order.rating" theme="primary" block @click="openReview">评价本次兑换</Button>
          <p v-else class="reviewed">
            已评价
            <Icon v-for="n in order.rating" :key="n" aria-hidden="true" name="star-filled" size="14px" class="review-star" />
            <template v-if="order.review"> · {{ order.review }}</template>
          </p>
        </template>
        <Button variant="text" block @click="router.push('/me/orders')">返回我的订单</Button>
      </section>
    </template>

    <Popup v-model:visible="reviewVisible" placement="bottom" :close-btn="true">
      <div class="review-sheet">
        <h3 class="review-title">评价「{{ order?.goodsName }}」</h3>
        <div class="review-field"><span class="review-label">评分</span><Rate v-model="reviewRating" :count="5" aria-label="订单评分" /></div>
        <div class="review-field"><label class="review-label">评价内容（选填）</label><Textarea v-model="reviewText" :maxlength="100" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="说说兑换体验（100 字内）…" /></div>
        <Button theme="primary" block :loading="reviewing" @click="onReviewSubmit">提交评价</Button>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-order-detail {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.review-field { display: flex; flex-direction: column; gap: var(--app-space-3); }
.review-label { font-size: var(--app-font-caption); color: var(--td-text-color-secondary); }

.state {
  padding: var(--app-space-10) 0;
}

.ticket-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-10) var(--app-space-8);
  border: 1px dashed var(--td-brand-color);
}

.ticket-card.invalid {
  border-color: var(--td-component-border);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.name {
  margin: 0;
  font-size: var(--app-font-title);
  font-weight: 600;
  line-height: 1.4;
}

.cost {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--app-font-body);
  font-weight: 600;
  color: var(--td-brand-color);
}

.qr-wrap {
  align-self: center;
  margin: var(--app-space-4) 0;
  padding: var(--app-space-5);
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-default);
}

.code {
  margin: 0;
  text-align: center;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.code code {
  color: var(--td-text-color-primary);
  font-weight: 600;
  letter-spacing: 1px;
}

.expiry,
.hint {
  margin: 0;
  text-align: center;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.info {
  margin: 0;
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.times {
  padding-top: var(--app-space-4);
  border-top: 1px dashed var(--td-component-border);
}

.times p {
  margin: 0 0 var(--app-space-2);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.times p:last-child {
  margin-bottom: 0;
}

.ops {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.reviewed {
  margin: 0;
  text-align: center;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.review-star {
  color: var(--td-warning-color);
  vertical-align: -2px;
}

.review-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8) var(--app-space-8) calc(var(--app-space-8) + env(safe-area-inset-bottom));
}

.review-title {
  margin: 0;
  font-size: var(--app-font-subtitle);
}
</style>
