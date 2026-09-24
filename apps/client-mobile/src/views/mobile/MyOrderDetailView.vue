<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Popup, QRCode, Rate, Textarea, Toast } from 'tdesign-mobile-vue'
import { cancelOrder, fetchMyOrder, reviewOrder } from '@/api/mall'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { MyOrder } from '@/types'
import StateTag from '@/components/shared/StateTag.vue'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDateTime, formatZhNumber, parseLocalDateTime } from '@/utils/format'

/* 订单详情（统一券码兑换三态）：待使用展示券码与二维码供现场核销，核销前可申请退款；
 * 已完成可评价；已取消/已过期仅展示状态（过期未使用由系统自动退回积分）。 */
const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const businessNowMs = useBusinessNow()

/** 独立详情接口；404（不存在或非本人）归一到页面既有的「订单不存在或已删除」文案 */
async function loadOrder(): Promise<MyOrder> {
  try {
    return await fetchMyOrder(id)
  } catch (e) {
    if (e instanceof ApiError && e.code === 404) throw new Error('订单不存在或已删除')
    throw e
  }
}

const { data: order, loading, error, run } = useAsyncList<MyOrder>(loadOrder)
onMounted(run)

function isExpired(item: MyOrder): boolean {
  if (String(item.status) === 'expired') return true
  const expiresAt = item.voucherExpiresAt ? parseLocalDateTime(item.voucherExpiresAt) : null
  return expiresAt ? expiresAt.getTime() < businessNowMs.value : false
}

/** 券码可用（展示二维码、可核销）：待使用且未过期 */
const canUse = computed(() => !!order.value && String(order.value.status) === 'pending_use' && !isExpired(order.value))
/** 可退款：待使用且未过期（过期券由定时任务自动退款，无需手动操作） */
const canRefund = computed(() => canUse.value)

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    Toast('兑换码已复制')
  } catch {
    Toast(`兑换码：${code}`)
  }
}

const acting = ref(false)

function onCancelOrder() {
  const item = order.value
  if (!item) return
  DialogPlugin.confirm({
    title: '申请退款',
    content: `退款后 ${formatZhNumber(item.pointsCost)} 积分将原路退回，库存恢复。确认退款？`,
    cancelBtn: '再想想',
    confirmBtn: '确认退款',
    onConfirm: async () => {
      acting.value = true
      try {
        await cancelOrder(item.id)
        Toast('已退款，积分已退回')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '退款失败，请稍后重试')
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

        <div v-if="canUse" class="qr-wrap">
          <QRCode :value="order.voucherCode" :size="140" level="M" aria-label="券码核销二维码" />
        </div>
        <p class="code">兑换码：<code translate="no">{{ order.voucherCode }}</code></p>
        <p class="expiry">
          {{ isExpired(order) ? `已于 ${formatLocalDateTime(order.voucherExpiresAt)} 过期` : `有效期至 ${formatLocalDateTime(order.voucherExpiresAt)}` }}
        </p>
        <p v-if="!canUse" class="hint">
          {{ String(order.status) === 'completed' ? '该券码已核销' : String(order.status) === 'cancelled' ? '该订单已取消' : '该券码已过期，积分将由系统自动退回' }}
        </p>

        <div class="times">
          <p>下单时间：{{ formatLocalDateTime(order.createdAt) }}</p>
          <p v-if="order.usedAt">核销时间：{{ formatLocalDateTime(order.usedAt) }}</p>
          <p v-if="order.finishedAt">完成时间：{{ formatLocalDateTime(order.finishedAt) }}</p>
        </div>
      </section>

      <section class="m-card ops">
        <Button v-if="canUse" variant="outline" block @click="copyCode(order!.voucherCode)">
          <template #icon><Icon aria-hidden="true" name="copy" size="16px" /></template>
          复制兑换码
        </Button>
        <Button v-if="canRefund" theme="danger" variant="outline" block :loading="acting" @click="onCancelOrder">申请退款</Button>
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
.review-label { font: var(--app-type-body-sm); color: var(--td-text-color-secondary); }

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
  font: var(--app-type-page-title);
}

.cost {
  margin: 0;
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
  color: var(--td-text-color-brand);
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
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.code code {
  color: var(--td-text-color-primary);
  font: var(--app-type-emphasis);
  letter-spacing: 1px;
}

.expiry,
.hint {
  margin: 0;
  text-align: center;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.info {
  margin: 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

/* 自提地址提示：品牌浅底强调，与收货信息区分 */
.pickup-info {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-2);
  padding: var(--app-space-4) var(--app-space-5);
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color-1);
  color: var(--td-text-color-primary);
}

.times {
  padding-top: var(--app-space-4);
  border-top: 1px dashed var(--td-component-border);
}

.times p {
  margin: 0 0 var(--app-space-2);
  font: var(--app-type-caption);
  font-variant-numeric: tabular-nums;
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
  font: var(--app-type-caption);
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
  font: var(--app-type-section);
}
</style>
