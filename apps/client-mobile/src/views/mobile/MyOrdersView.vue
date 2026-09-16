<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Popup, Rate, Textarea, Toast } from 'tdesign-mobile-vue'
import { confirmOrder, fetchMyOrders, useOrder, cancelOrder, reviewOrder } from '@/api/mall'
import { useAsyncList } from '@/composables/useAsyncList'
import { formatMockStamp } from '@/mock/runtime'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyOrder } from '@/types'

/* 移动我的兑换订单：订单卡片（商品/积分/状态/时间）；shipped 可确认收货（Dialog 二次确认）；空态提供去兑换入口 */
const router = useRouter()

const { data, loading, error, run } = useAsyncList<MyOrder[]>(() => fetchMyOrders())
onMounted(run)

const actingId = ref('')

/* v41：订单评价 */
const reviewFor = ref<MyOrder | null>(null)
const reviewRating = ref(5)
const reviewText = ref('')
const reviewing = ref(false)
function openReview(o: MyOrder) {
  reviewFor.value = o
  reviewRating.value = 5
  reviewText.value = ''
}
async function onReviewSubmit() {
  if (!reviewFor.value) return
  reviewing.value = true
  try {
    await reviewOrder(reviewFor.value.id, reviewRating.value, reviewText.value)
    Toast('评价已提交')
    reviewFor.value = null
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '评价失败，请稍后重试')
  } finally {
    reviewing.value = false
  }
}

function onConfirmReceipt(o: MyOrder) {
  DialogPlugin.confirm({
    title: '确认收货',
    content: `确认已收到「${o.goodsName}」？确认后订单将完成。`,
    cancelBtn: '取消',
    confirmBtn: '确认收货',
    onConfirm: () => {
      void doConfirm(o)
    },
  })
}

async function doConfirm(o: MyOrder) {
  actingId.value = o.id
  try {
    await confirmOrder(o.id)
    Toast('已确认收货')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  } finally {
    actingId.value = ''
  }
}

function onUse(o: MyOrder) {
  DialogPlugin.confirm({
    title: '核销权益',
    content: `确认已使用「${o.goodsName}」？核销后订单将完成。`,
    cancelBtn: '取消',
    confirmBtn: '确认核销',
    onConfirm: () => {
      void doUse(o)
    },
  })
}

async function doUse(o: MyOrder) {
  actingId.value = o.id
  try {
    await useOrder(o.id)
    Toast('权益已核销')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  } finally {
    actingId.value = ''
  }
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    Toast('券码已复制')
  } catch {
    Toast(`券码：${code}`)
  }
}

/* v38：券码有效期与取消订单 */
function voucherExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false
  return expiresAt < formatMockStamp()
}

function onCancelOrder(o: MyOrder) {
  DialogPlugin.confirm({
    title: '取消兑换',
    content: `取消后「${o.goodsName}」的 ${o.pointsCost} 积分将退回，库存恢复。确认取消？`,
    cancelBtn: '再想想',
    confirmBtn: '确认取消',
    onConfirm: async () => {
      actingId.value = o.id
      try {
        await cancelOrder(o.id)
        Toast('订单已取消，积分已退回')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
      } finally {
        actingId.value = ''
      }
    },
  })
}
</script>

<template>
  <div class="m-orders page-fade-in stagger">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="(data ?? []).length > 0">
      <p class="list-count">共 {{ (data ?? []).length }} 笔订单</p>
      <div v-for="o in data" :key="o.id" class="m-card">
        <div class="row">
          <p class="name">{{ o.goodsName }}</p>
          <StateTag kind="order" :value="o.status" />
        </div>
        <p class="cost">{{ o.pointsCost }} 积分</p>
        <p v-if="o.recipientAddress" class="recipient">收货：{{ o.recipientName }} {{ o.recipientPhone }} · {{ o.recipientAddress }}</p>
        <p v-if="o.trackingNo" class="recipient">物流单号：{{ o.trackingNo }}</p>
        <p v-if="o.voucherCode" class="voucher">
          券码：<code>{{ o.voucherCode }}</code>
          <Button size="small" variant="outline" :disabled="voucherExpired(o.voucherExpiresAt)" @click="copyCode(o.voucherCode)">复制</Button>
          <span v-if="voucherExpired(o.voucherExpiresAt)" class="expired">已过期</span>
          <span v-else-if="o.voucherExpiresAt" class="expiry">有效期至 {{ o.voucherExpiresAt }}</span>
        </p>
        <p class="meta">
          下单时间：{{ o.createdAt }}<template v-if="o.shippedAt"> · 发货时间：{{ o.shippedAt }}</template><template v-if="o.usedAt"> · 使用时间：{{ o.usedAt }}</template><template v-if="o.finishedAt"> · 完成时间：{{ o.finishedAt }}</template>
        </p>
        <div v-if="o.status === 'completed'" class="ops">
          <Button v-if="!o.rating" theme="primary" size="small" @click="openReview(o)">评价</Button>
          <span v-else class="reviewed">已评价 {{ '★'.repeat(o.rating) }}<template v-if="o.review"> · {{ o.review }}</template></span>
        </div>
        <div v-if="o.status === 'shipped' || o.status === 'pending_use' || o.status === 'pending_shipment'" class="ops">
          <Button
            v-if="o.status === 'shipped'"
            theme="primary"
            size="small"
            :disabled="actingId === o.id"
            @click="onConfirmReceipt(o)"
          >
            {{ actingId === o.id ? '处理中…' : '确认收货' }}
          </Button>
          <Button
            v-else-if="o.status === 'pending_use'"
            theme="primary"
            size="small"
            :disabled="actingId === o.id"
            @click="onUse(o)"
          >
            {{ actingId === o.id ? '处理中…' : '立即使用' }}
          </Button>
          <Button
            v-else
            variant="outline"
            size="small"
            :disabled="actingId === o.id"
            @click="onCancelOrder(o)"
          >
            {{ actingId === o.id ? '处理中…' : '取消兑换' }}
          </Button>
        </div>
      </div>
    </template>
    <template v-else>
      <EmptyBlock text="暂无兑换订单" />
      <Button theme="primary" class="go-mall" @click="router.push('/mall')">去兑换 ›</Button>
    </template>

    <Popup :visible="!!reviewFor" placement="bottom" @update:visible="(v: boolean) => { if (!v) reviewFor = null }">
      <div v-if="reviewFor" class="review-sheet">
        <h3 class="review-title">评价「{{ reviewFor.goodsName }}」</h3>
        <Rate v-model="reviewRating" :count="5" />
        <Textarea v-model="reviewText" :maxlength="100" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="说说兑换体验（选填，100 字内）" />
        <Button theme="primary" block :loading="reviewing" @click="onReviewSubmit">提交评价</Button>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.review-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.review-title {
  margin: 0;
  font-size: 16px;
}

.reviewed {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.m-orders {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.error-box {
  text-align: center;
  color: var(--td-error-color);
  font-size: 12px;
}

.error-box p {
  margin: 0 0 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cost {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-brand-color);
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ops {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.voucher {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.voucher code {
  padding: 2px 6px;
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-brand-color);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.recipient {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.expired {
  color: var(--td-error-color);
  font-size: 12px;
}

.expiry {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.go-mall {
  align-self: center;
}
</style>
