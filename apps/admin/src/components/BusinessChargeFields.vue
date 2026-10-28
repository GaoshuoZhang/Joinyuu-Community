<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ amountFen?: number; refundPolicy?: string; label: string; help: string }>()
const emit = defineEmits<{ 'update:amountFen': [value: number]; 'update:refundPolicy': [value: string] }>()
const amount = computed({
  get: () => (props.amountFen ?? 0) / 100,
  set: (value: number | undefined) => emit('update:amountFen', value == null ? 0 : Math.round(value * 100)),
})
</script>
<template>
  <div class="business-charge-fields">
    <t-divider align="left">现金收费</t-divider>
    <t-form-item :label="label" name="chargeAmountFen" :help="help">
      <t-input-number v-accessible-field v-model="amount" :min="0" :max="1000000" :decimal-places="2" theme="normal" class="ctl-w-full" suffix="元" />
    </t-form-item>
    <t-form-item v-if="(amountFen ?? 0) > 0" label="交付与退款约定" name="chargeRefundPolicy" help="写清交付内容、可退款条件与申请期限；出账时保存此约定的快照。">
      <t-textarea v-accessible-field :model-value="refundPolicy ?? ''" :maxlength="2000" placeholder="请填写交付内容与退款约定…" @update:model-value="emit('update:refundPolicy', $event)" />
    </t-form-item>
    <p class="charge-tip">0 表示未设置现金收费。保存后可在业务详情中创建应收账单；改价仅影响新账单。当前客户端仍按原有流程运行，收款后需由运营确认交付。</p>
  </div>
</template>
<style scoped>
.business-charge-fields { min-width: 0; }
.charge-tip { margin: 0 0 20px; color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.7; }
</style>
