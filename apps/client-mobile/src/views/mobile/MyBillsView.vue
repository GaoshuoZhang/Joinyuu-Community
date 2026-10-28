<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { createBillOrder, fetchMyBills } from '@/api/commerce'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import { formatLocalDate } from '@/utils/format'
import { formatFen } from '@/utils/money'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommerceBillList } from '@/types'

/* 待缴账单（租约）：仅展示后台已出的应收账单，客户端不按租金字符串生成金额。
 * 企业账单仅负责人可见/可缴；普通成员无财务授权。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList<CommerceBillList>(() => fetchMyBills({ page: 1, pageSize: 100 }))
const payingId = ref('')

onMounted(run)

const bills = computed(() => data.value?.list ?? [])

async function pay(billId: string) {
  if (payingId.value) return
  payingId.value = billId
  try {
    const order = await createBillOrder(billId)
    await router.push(`/checkout/${order.id}`)
  } catch (e) {
    Toast(e instanceof ApiError || e instanceof Error ? e.message : '创建缴费单失败，请稍后重试')
    await run()
  } finally {
    payingId.value = ''
  }
}
</script>

<template>
  <div class="my-bills page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock
      v-else-if="!bills.length"
      text="暂无待缴账单"
      action-text="返回工位租约"
      @action="router.push('/me/leases')"
    />

    <template v-else>
      <section class="total m-card" aria-label="待缴总额">
        <span class="total__label">待缴总额</span>
        <strong class="total__value">{{ formatFen(data?.totalDueFen ?? 0) }}</strong>
        <span class="total__count">共 {{ data?.total ?? bills.length }} 笔</span>
      </section>

      <section v-for="bill in bills" :key="bill.id" class="m-card bill" :aria-label="`账单 ${bill.title}`">
        <div class="bill__head">
          <h2 class="bill__title">{{ bill.title }}</h2>
          <StateTag kind="bill" value="unpaid" />
        </div>
        <p class="bill__meta">账期：{{ bill.period }} · 购买主体：{{ bill.buyerName }}</p>
        <p class="bill__meta" :class="{ 'bill__meta--overdue': bill.overdue }">
          到期日：{{ formatLocalDate(bill.dueDate) }}{{ bill.overdue ? '（已逾期）' : '' }}
        </p>
        <div class="bill__foot">
          <span class="bill__amount">{{ formatFen(bill.dueFen) }}</span>
          <Button theme="primary" size="small" :loading="payingId === bill.id" :disabled="Boolean(payingId)" @click="pay(bill.id)">
            去缴费
          </Button>
        </div>
      </section>

      <p class="hint">缴费成功后不会自动改变租期、办公位分配或生成续租合同；如需退款请联系运营。</p>
      <Button variant="text" block @click="router.push('/me/leases')">返回工位租约</Button>
    </template>
  </div>
</template>

<style scoped>
.my-bills {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8);
}

.total {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-3);
}

.total__label {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.total__value {
  color: var(--td-text-color-primary);
  font: var(--app-type-numeric-lg);
  font-variant-numeric: tabular-nums;
}

.total__count {
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
}

.bill {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.bill__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.bill__title {
  margin: 0;
  min-width: 0;
  font: var(--app-type-card-title);
  overflow-wrap: anywhere;
}

.bill__meta {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
  overflow-wrap: anywhere;
}

.bill__meta--overdue {
  color: var(--td-error-color);
}

.bill__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  margin-top: var(--app-space-2);
  padding-top: var(--app-space-3);
  border-top: 1px dashed var(--td-component-border);
}

.bill__amount {
  color: var(--td-text-color-primary);
  font: var(--app-type-numeric);
  font-variant-numeric: tabular-nums;
}

.hint {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
}
</style>
