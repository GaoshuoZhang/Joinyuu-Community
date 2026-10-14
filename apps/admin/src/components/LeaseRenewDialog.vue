<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard } from '@/utils/form'
import { renewLease } from '@/api/workstations'
import type { Lease, RentPeriod } from '@/types'

/* 租约续期弹窗：延长到期日（必须晚于当前到期日）+ 租金（默认沿用，可一并调整）+ 续期说明（必填留痕）。
 * 续期独立于「编辑」：成功后服务端追加续期记录（租赁详情「续期记录」选项卡）。
 * 已终止 / 已归档租约与长期租约（无到期日）不提供入口。 */
const props = defineProps<{
  visible: boolean
  lease: Lease | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()

const form = reactive({
  endDate: '',
  monthlyRent: 0 as number | undefined,
  reason: '',
})

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, guardClose } = useDialogDirtyGuard(form)

const rules: FormProps['rules'] = {
  endDate: [{ required: true, message: '请选择新到期日', trigger: 'submit' }],
  monthlyRent: [{ required: true, message: '请输入租金', trigger: 'submit' }],
  reason: [{ required: true, message: '请填写续期说明', trigger: 'submit' }],
}

const rentPeriodLabelMap: Record<RentPeriod, string> = { day: '日', week: '周', month: '月', year: '年' }
const rentUnit = computed(() => rentPeriodLabelMap[(props.lease?.rentPeriod ?? 'month') as RentPeriod])

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* 新到期日默认值：原到期日顺延一个租金周期（原租期已过期时则从今天顺延），均为「含当日」口径 */
function defaultEndDate(lease: Lease): string {
  const period = (lease.rentPeriod ?? 'month') as RentPeriod
  const today = fmtDate(new Date())
  const base = lease.endDate && lease.endDate > today ? lease.endDate : today
  const d = new Date(`${base}T00:00:00`)
  if (period === 'day') d.setDate(d.getDate() + 1)
  else if (period === 'week') d.setDate(d.getDate() + 7)
  else if (period === 'year') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return fmtDate(d)
}

watch(
  () => props.visible,
  (v) => {
    if (!v || !props.lease) return
    form.endDate = defaultEndDate(props.lease)
    form.monthlyRent = props.lease.monthlyRent
    form.reason = ''
    markBaseline()
  },
)

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  const lease = props.lease
  if (!lease) return
  /* 服务端兜底同口径校验，此处先行提示（避免一次无效请求） */
  if (!lease.longTerm && form.endDate <= lease.endDate) {
    MessagePlugin.error(`新到期日须晚于当前到期日（${lease.endDate}）`)
    return
  }
  submitting.value = true
  try {
    await renewLease(lease.id, {
      endDate: form.endDate,
      /* required 规则已拦截空值，此处兜底窄化类型 */
      monthlyRent: form.monthlyRent ?? lease.monthlyRent,
      reason: form.reason.trim(),
    })
    MessagePlugin.success('租约已续期')
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '续期失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  /* 未保存保护：有改动时弹确认（见 useDialogDirtyGuard） */
  guardClose(() => emit('update:visible', false))
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="true"
    :visible="visible"
    :header="lease ? `续期租约 · ${lease.id}` : '续期租约'"
    width="560px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">确认续期</t-button>
      </div>
    </template>

    <div v-if="lease" class="renew-summary">
      {{ lease.enterpriseName }} · 当前租期 {{ lease.startDate }} ~ {{ lease.endDate }}
    </div>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <div class="form-row">
        <t-form-item label="新到期日" name="endDate">
          <t-date-picker clearable v-model="form.endDate" valueType="YYYY-MM-DD" class="ctl-w-full" placeholder="选择续期后的到期日…" />
          <template #help>须晚于当前到期日；默认按租金周期顺延一期</template>
        </t-form-item>
        <t-form-item :label="`租金（元）/ ${rentUnit}`" name="monthlyRent">
          <t-input-number class="ctl-w-full" v-model="form.monthlyRent" :min="0" theme="column" placeholder="默认沿用当前租金…" />
          <template #help>默认沿用当前租金，可随续期一并调整</template>
        </t-form-item>
      </div>
      <t-form-item label="续期说明" name="reason">
        <t-textarea
          v-model="form.reason"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="如：客户续租一年，租金不变（将记录到续期记录）…"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
/* 弹窗顶部信息条：明确「续谁的租、当前租期到哪天」 */
.renew-summary {
  margin-bottom: 12px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 20px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}

/* 两列栅格表单（与租约新增/编辑弹窗同口径） */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
</style>