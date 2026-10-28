<script setup lang="ts">
import { Button } from 'tdesign-mobile-vue'
import MoneyDisplay from './MoneyDisplay.vue'

withDefaults(
  defineProps<{
    amountFen: number
    label: string
    loading?: boolean
    disabled?: boolean
    hint?: string
  }>(),
  { loading: false, disabled: false, hint: '' },
)

defineEmits<{ primary: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="pay-bar" role="region" aria-label="支付操作">
      <div class="pay-bar__inner">
        <div class="pay-bar__amount">
          <span class="pay-bar__label">应付</span>
          <MoneyDisplay :fen="amountFen" size="lg" />
        </div>
        <p v-if="hint" class="pay-bar__hint">{{ hint }}</p>
        <Button theme="primary" size="large" block :loading="loading" :disabled="disabled" @click="$emit('primary')">
          {{ label }}
        </Button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pay-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 90;
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  box-shadow: var(--app-fixed-bar-shadow, 0 -4px 16px rgb(0 0 0 / 6%));
}

.pay-bar__inner {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-4) var(--app-space-8) calc(var(--app-space-4) + env(safe-area-inset-bottom));
}

.pay-bar__amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.pay-bar__label {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.pay-bar__hint {
  margin: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
  overflow-wrap: anywhere;
}
</style>
