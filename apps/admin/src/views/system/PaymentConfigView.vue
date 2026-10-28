<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PaymentConfigPanel from './PaymentConfigPanel.vue'
const route = useRoute(), router = useRouter()
const active = computed({ get: () => route.query.provider === 'alipay' ? 'alipay' : 'wechat', set: (provider: string | number) => { void router.replace({ query: { ...route.query, provider: String(provider) } }) } })
</script>
<template>
  <div class="payment-config-view">
    <t-tabs v-model="active" aria-label="收款渠道">
      <t-tab-panel value="wechat" label="微信" lazy :destroy-on-hide="false"><PaymentConfigPanel /></t-tab-panel>
      <t-tab-panel value="alipay" label="支付宝" lazy><t-card :bordered="false"><t-alert theme="info" title="支付宝暂未开通" message="当前无法配置或发起支付宝收款。" /></t-card></t-tab-panel>
    </t-tabs>
  </div>
</template>
<style scoped>
.payment-config-view { min-width: 0; }
.payment-config-view :deep(.t-tabs__content) { padding-top: 16px; background: var(--td-bg-color-page); }
</style>
