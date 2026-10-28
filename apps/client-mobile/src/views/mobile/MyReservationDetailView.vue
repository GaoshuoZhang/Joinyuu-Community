<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { cancelReservation, fetchMyReservation } from '@/api/spaces'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { SpaceReservationDetail } from '@/types'
import { formatLocalDate, formatLocalDateTime } from '@/utils/format'
import { formatFen } from '@/utils/money'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const { data: reservation, loading, error, run } = useAsyncList<SpaceReservationDetail>(() => fetchMyReservation(id))
onMounted(run)

const acting = ref(false)
const cash = computed(() => (reservation.value?.amountFen ?? 0) > 0)
/* 与「我的预约」列表口径一致：待审核/已通过可取消；现金预约和待付款预约走现金交易，不能调积分取消接口 */
const canCancel = computed(() => {
  const item = reservation.value
  if (!item || cash.value || item.status === 'pending_payment') return false
  return item.status === 'pending' || item.status === 'approved'
})
const canPay = computed(() => reservation.value?.status === 'pending_payment' && !!reservation.value?.commerceOrderId)
const canAfterSales = computed(() => cash.value && reservation.value?.status === 'approved' && !!reservation.value?.commerceOrderId)
/* 费用：现金实付优先；积分预约展示实扣积分（驳回/取消已全额退回） */
const feeText = computed(() => {
  const item = reservation.value
  if (!item) return ''
  if ((item.amountFen ?? 0) > 0) {
    const suffix = item.status === 'cancelled' ? '（预约已取消）' : item.status === 'pending_payment' ? '（待付款）' : ''
    return `现金 ${formatFen(item.amountFen ?? 0)}${suffix}`
  }
  if (item.feePoints <= 0) return '免费'
  const refunded = item.status === 'rejected' || item.status === 'cancelled'
  return refunded ? `${item.feePoints} 积分（已退回）` : `${item.feePoints} 积分`
})
const timeline = computed(() => {
  const item = reservation.value
  if (!item) return []
  const records = [...item.records]
  /* 已结束（ended）由 approved 派生，同样保留「已通过」兜底记录 */
  if ((item.status === 'approved' || item.status === 'ended') && !records.some((record) => record.action === 'approve')) {
    records.push({ at: '', action: 'approve', title: '预约已通过', text: '当前状态已通过，处理时间暂无记录' })
  }
  return records
})

function onCancelTap() {
  const item = reservation.value
  if (!item) return
  const refundTip = item.feePoints > 0 ? `已扣 ${item.feePoints} 积分将全额退回。` : ''
  confirmDialog({
    title: '取消预约',
    content: `确认取消「${item.spaceName}」${formatLocalDate(item.date)} ${item.start}-${item.end} 的预约？${refundTip}`,
    cancelBtn: '保留预约',
    confirmBtn: '确认取消',
    onConfirm: () => {
      void doCancel()
    },
  })
}

async function doCancel() {
  acting.value = true
  try {
    await cancelReservation(id)
    Toast('已取消预约')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div class="detail-page page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="reservation">
      <section class="m-card hero">
        <div class="head"><h2>{{ reservation.spaceName }}</h2><StateTag kind="reservation" :value="reservation.status" /></div>
        <p>{{ formatLocalDate(reservation.date) }} · {{ reservation.start }} - {{ reservation.end }}</p>
        <p>编号 {{ reservation.id }} · 提交于 {{ formatLocalDateTime(reservation.createdAt) }}</p>
      </section>
      <section class="m-card section">
        <h3>预约信息</h3>
        <dl class="fields">
          <dt>预约用途</dt><dd>{{ reservation.purpose || '未填写' }}</dd>
          <dt>参与人数</dt><dd class="tabular-nums">{{ reservation.attendees }} 人</dd>
          <dt>费用</dt><dd class="tabular-nums">{{ feeText }}</dd>
          <template v-if="reservation.identityType"><dt>预约身份</dt><dd class="identity"><IdentityTag :type="reservation.identityType" /><span>{{ reservation.subjectName }}</span></dd></template>
        </dl>
      </section>
      <section v-if="reservation.rejectReason" class="m-card section reject"><h3>审核意见</h3><p>{{ reservation.rejectReason }}</p></section>
      <section v-if="timeline.length" class="m-card section">
        <h3>处理进度</h3>
        <ol class="timeline">
          <li v-for="(record, index) in timeline" :key="`${record.at}-${index}`">
            <b>{{ record.title }}</b><span v-if="record.at">{{ formatLocalDateTime(record.at) }}</span>
            <p v-if="record.text">{{ record.text }}</p><small v-if="record.operator">操作人：{{ record.operator }}</small>
          </li>
        </ol>
      </section>
      <section v-if="canPay" class="m-card section">
        <h3>待完成付款</h3>
        <p class="notice">付款成功后预约才会生效；未付款订单超时关闭后时段将释放。</p>
        <Button theme="primary" block @click="router.push(`/checkout/${reservation.commerceOrderId}`)">去支付</Button>
      </section>
      <Button v-if="canCancel" theme="danger" variant="outline" block :disabled="acting" @click="onCancelTap">
        {{ acting ? '处理中…' : '取消预约' }}
      </Button>
      <Button v-if="canAfterSales" theme="danger" variant="outline" block @click="router.push(`/me/transactions/${reservation.commerceOrderId}`)">退款/售后</Button>
      <Button block variant="text" @click="router.push('/me/reservations')">返回我的预约</Button>
    </template>
  </div>
</template>

<style scoped>
.detail-page { padding: var(--app-space-8); display: flex; flex-direction: column; gap: var(--app-space-5); }
.hero, .section { display: flex; flex-direction: column; gap: var(--app-space-4); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--app-space-4); }
h2, h3, p { margin: 0; }
h2 { min-width: 0; font: var(--app-type-section); }
h3 { font: var(--app-type-card-title); }
.hero p { font: var(--app-type-caption); color: var(--td-text-color-secondary); }
.fields { display: grid; grid-template-columns: 76px 1fr; gap: var(--app-space-4); margin: 0; font: var(--app-type-body); }
.fields dt { color: var(--td-text-color-placeholder); }
.fields dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.identity { display: flex; align-items: center; flex-wrap: wrap; gap: var(--app-space-2); }
.notice { font: var(--app-type-body-sm); color: var(--td-text-color-secondary); }
.reject { border-color: var(--td-error-color-3); }
.reject p { font: var(--app-type-body); color: var(--td-error-color); }
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li { position: relative; padding: 0 0 var(--app-space-5) var(--app-space-7); border-left: 1px solid var(--td-component-border); }
.timeline li:last-child { padding-bottom: 0; }
.timeline li::before { content: ''; position: absolute; left: -5px; top: 4px; width: 9px; height: 9px; border-radius: var(--td-radius-circle); background: var(--td-brand-color); }
.timeline b, .timeline span { display: block; font: var(--app-type-emphasis-sm); }
.timeline span, .timeline small { color: var(--td-text-color-placeholder); }
.timeline p { margin-top: var(--app-space-2); font: var(--app-type-body-sm); color: var(--td-text-color-secondary); }
</style>
