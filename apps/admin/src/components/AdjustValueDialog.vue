<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import type { FormProps } from 'tdesign-vue-next'

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

const formRef = ref()
const form = reactive({ direction: 'add' as 'add' | 'subtract', amount: 1, reason: '' })

/* 校验挂在表单上（trigger: submit）：错误就地标红，不再用 toast 抛错后丢失输入 */
const rules: FormProps['rules'] = {
  amount: [
    { required: true, message: '请输入调整数量', trigger: 'submit' },
    {
      validator: (val: number) =>
        Number.isInteger(val) && val >= 1 ? true : { result: false, message: '请输入不小于 1 的整数' },
      trigger: 'submit',
    },
    {
      validator: (val: number) =>
        form.direction === 'subtract' && val > props.balance
          ? { result: false, message: '扣减值不能超过当前余额' }
          : true,
      trigger: 'submit',
    },
  ],
  reason: [{ required: true, message: '请填写调整事由', trigger: 'submit' }],
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      form.direction = 'add'
      form.amount = 1
      form.reason = ''
      nextTick(() => formRef.value?.clearValidate())
    }
  },
)

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  emit('submit', form.direction === 'add' ? form.amount : -form.amount, form.reason.trim())
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
    :close-on-overlay-click="false"
    @confirm="onConfirm"
    @close="onClose"
  >
    <div class="balance-line">
      <span class="balance-label">{{ balanceLabel }}</span>
      <span class="balance-num">{{ balance }}</span>
    </div>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="调整方向">
        <t-radio-group v-model="form.direction">
          <t-radio-button value="add">增加</t-radio-button>
          <t-radio-button value="subtract">扣减</t-radio-button>
        </t-radio-group>
      </t-form-item>
      <t-form-item label="数量" name="amount">
        <t-input-number v-model="form.amount" :min="1" :step="1" :decimal-places="0" theme="column" class="ctl-w-full" />
      </t-form-item>
      <t-form-item label="调整事由" name="reason">
        <t-textarea
          v-model="form.reason"
          placeholder="必填，如「承接项目结项奖励」「违规扣减」…"
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
  border-radius: var(--td-radius-medium);
}

.balance-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.balance-num {
  font-size: 16px;
  font-weight: 600;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}
</style>
