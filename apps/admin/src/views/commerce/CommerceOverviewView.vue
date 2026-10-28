<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchCommerceOverview, money, type CommerceOverview } from '@/api/commerce'
import { useAuthStore } from '@/stores/auth'
const router = useRouter(), auth = useAuthStore()
const data = ref<CommerceOverview | null>(null), loading = ref(false), loadError = ref('')
async function load() {
  loading.value = true; loadError.value = ''
  try { data.value = await fetchCommerceOverview() } catch (e) { loadError.value = e instanceof Error ? e.message : '加载失败' } finally { loading.value = false }
}
onMounted(load)
</script>
<template>
  <div class="commerce-page page-fade-in">
  <PageHeader title="经营概览" description="独立收费账单的累计收款与待办，不包含原积分兑换记录。" />
  <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
  <t-loading :loading="loading">
    <div v-if="data" class="commerce-metrics">
      <t-card title="累计确认收款"><strong>{{ money(data.paidFen) }}</strong><p>微信已确认收款与已复核线下收款</p></t-card>
      <t-card title="累计成功退款"><strong>{{ money(data.refundedFen) }}</strong><p>仅计入渠道已确认的退款</p></t-card>
      <t-card title="累计收款净额"><strong>{{ money(data.paidFen - data.refundedFen) }}</strong><p>未扣手续费及成本，不代表利润</p></t-card>
      <t-card title="待收金额"><strong>{{ money(data.unpaidFen) }}</strong><p>{{ data.unpaidCount }} 笔未缴账单</p></t-card>
    </div>
    <t-card v-if="data" title="经营待办" class="commerce-todos">
      <t-space direction="vertical">
        <p>逾期账单 {{ data.overdueCount }} 笔 · 待复核线下收款 {{ data.pendingReceipts }} 笔 · 待确认微信付款 {{ data.pendingPayments }} 笔</p>
        <t-button v-if="auth.hasPerm('/commerce/receivables')" @click="router.push('/commerce/receivables')">查看应收与交易</t-button>
      </t-space>
    </t-card>
  </t-loading>
  </div>
</template>
<style scoped>
.commerce-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.commerce-metrics strong { font-size: var(--td-font-size-headline-medium); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.commerce-metrics p { color: var(--td-text-color-secondary); margin: 12px 0 0; }
.commerce-todos { margin-top: 16px; }
</style>
