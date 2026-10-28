<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ mode: 'points' | 'cash'; points: number; amountFen?: number; refundPolicy?: string; pointName: string; pointLabel: string; cashLabel: string; minimumPoints: number }>()
const emit = defineEmits<{ 'update:mode': [value: 'points' | 'cash']; 'update:points': [value: number]; 'update:amountFen': [value: number]; 'update:refundPolicy': [value: string] }>()
const yuan = computed({ get: () => (props.amountFen ?? 0) / 100, set: (v: number | undefined) => emit('update:amountFen', v == null ? 0 : Math.round(v * 100)) })
function select(value: string | number | boolean) {
  if (value !== 'cash' && value !== 'points') return
  emit('update:mode', value)
  if (value === 'cash') { emit('update:points', 0); if (!props.amountFen) emit('update:amountFen', 100) }
  else { emit('update:amountFen', 0); if (props.points < props.minimumPoints) emit('update:points', props.minimumPoints) }
}
</script>
<template>
  <div class="exclusive-price-fields">
    <t-form-item label="计价方式" help="只能选择积分或现金，不支持积分和现金混合支付。切换后按所选方式保存。">
      <t-radio-group v-accessible-field :model-value="mode" @change="select">
        <t-radio-button value="points">{{ pointLabel }}</t-radio-button>
        <t-radio-button value="cash">{{ cashLabel }}</t-radio-button>
      </t-radio-group>
    </t-form-item>
    <t-form-item v-if="mode === 'points'" :label="pointLabel" :name="pointName" :help="minimumPoints === 0 ? '0 表示免费使用，不扣积分。' : '填写大于 0 的整数积分；现金售价按 0 保存。'">
      <t-input-number v-accessible-field :model-value="points" :min="minimumPoints" :max="100000000" :decimal-places="0" suffix="积分" theme="normal" class="ctl-w-full" @update:model-value="emit('update:points', $event ?? 0)" />
    </t-form-item>
    <template v-else>
      <t-form-item :label="cashLabel" name="chargeAmountFen" help="单位为元，最多两位小数；积分按 0 保存。现金收款在应收账单中处理。">
        <t-input-number v-accessible-field v-model="yuan" :min="0.01" :max="1000000" :decimal-places="2" suffix="元" theme="normal" class="ctl-w-full" />
      </t-form-item>
      <t-form-item label="交付与退款约定" name="chargeRefundPolicy" help="写清交付内容、退款条件及申请期限；出账后保留约定快照。">
        <t-textarea v-accessible-field :model-value="refundPolicy ?? ''" :maxlength="2000" placeholder="请填写交付内容与退款约定…" @update:model-value="emit('update:refundPolicy', $event)" />
      </t-form-item>
      <p class="cash-tip">当前客户端现金收银台尚未开放，现金商品/空间需联系运营处理；不会按 0 积分兑换或预约。</p>
    </template>
  </div>
</template>
<style scoped>
.exclusive-price-fields { min-width: 0; }
.cash-tip { margin: 0 0 20px; color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.7; }
</style>
