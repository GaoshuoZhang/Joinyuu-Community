<script setup lang="ts">
import { Button, Popup, QRCode } from 'tdesign-mobile-vue'
import MoneyDisplay from './MoneyDisplay.vue'

withDefaults(
  defineProps<{
    visible: boolean
    codeUrl: string
    amountFen?: number
    expiresText?: string
  }>(),
  { amountFen: 0, expiresText: '' },
)

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
</script>

<template>
  <Popup :visible="visible" placement="bottom" :close-on-overlay-click="true" @update:visible="emit('update:visible', $event)">
    <div class="qr" role="document">
      <h3 class="qr__title">微信扫码支付</h3>
      <p class="qr__amount"><MoneyDisplay :fen="amountFen" size="lg" /></p>
      <div class="qr__code">
        <QRCode :value="codeUrl" :size="220" level="M" aria-label="微信支付二维码" />
      </div>
      <p class="qr__tip">请使用手机微信「扫一扫」完成付款；本页会持续查询支付结果，请勿重复付款。</p>
      <p v-if="expiresText" class="qr__expires" role="timer">剩余支付时间 {{ expiresText }}</p>
      <Button theme="primary" size="large" block @click="emit('update:visible', false)">我已完成支付</Button>
    </div>
  </Popup>
</template>

<style scoped>
.qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-4);
  padding: var(--app-space-8);
  padding-bottom: calc(var(--app-space-8) + env(safe-area-inset-bottom));
  background: var(--td-bg-color-container);
}

.qr__title {
  margin: 0;
  font: var(--app-type-section);
}

.qr__amount {
  margin: 0;
}

.qr__code {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--app-space-4);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-container);
}

.qr__tip {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
  text-align: center;
  overflow-wrap: anywhere;
}

.qr__expires {
  margin: 0;
  color: var(--td-warning-color);
  font: var(--app-type-emphasis-xs);
  font-variant-numeric: tabular-nums;
}
</style>
