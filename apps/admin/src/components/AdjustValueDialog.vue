<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

/* 数值调整弹窗（经验值/积分共用）：方向 + 数量 + 事由，校验后交由父组件调 API */
const props = defineProps<{
  visible: boolean
  header: string
  /** 余额展示标签，如「当前经验值」 */
  balanceLabel: string
  balance: number
  /** 父组件 API 调用中的 loading */
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'submit', delta: number, reason: string): void
}>()

const direction = ref<'add' | 'subtract'>('add')
const amount = ref<number>(1)
const reason = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v) {
      direction.value = 'add'
      amount.value = 1
      reason.value = ''
    }
  },
)

function onConfirm() {
  if (!amount.value || !Number.isInteger(amount.value) || amount.value < 1) {
    MessagePlugin.warning('请输入不小于 1 的整数')
    return
  }
  if (direction.value === 'subtract' && amount.value > props.balance) {
    MessagePlugin.warning('扣减值不能超过当前余额')
    return
  }
  if (!reason.value.trim()) {
    MessagePlugin.warning('请填写调整事由')
    return
  }
  emit('submit', direction.value === 'add' ? amount.value : -amount.value, reason.value.trim())
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="header"
    width="480px"
    :confirm-btn="{ content: '确认调整', loading: loading }"
    cancel-btn="取消"
    @confirm="onConfirm"
    @close="onClose"
  >
    <div class="balance-line">
      <span class="balance-label">{{ balanceLabel }}</span>
      <span class="balance-num">{{ balance }}</span>
    </div>
    <t-form label-align="top">
      <t-form-item label="调整方向">
        <t-radio-group v-model="direction">
          <t-radio-button value="add">增加</t-radio-button>
          <t-radio-button value="subtract">扣减</t-radio-button>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="数量">
        <t-input-number v-model="amount" :min="1" :step="1" theme="column" style="width: 100%" />
      </t-form-item>
      <t-form-item label="调整事由">
        <t-textarea
          v-model="reason"
          placeholder="必填，如「承接项目结项奖励」「违规扣减」"
          :autosize="{ minRows: 2, maxRows: 4 }"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.balance-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 16px;
  background: var(--td-bg-color-page);
  border-radius: 6px;
}

.balance-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.balance-num {
  font-size: 16px;
  font-weight: 600;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}
</style>
