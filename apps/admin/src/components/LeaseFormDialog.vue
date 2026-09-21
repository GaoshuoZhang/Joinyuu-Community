<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import { createLease, fetchRenterOptions, updateLease } from '@/api/workstations'
import { workstationTypeMap } from '@/constants/status'
import type { Lease, LeaseRenterType, RentPeriod, Workstation } from '@/types'

/* 租约新增/编辑弹窗（办公位分配入口）：
 * 新增 = 选择租赁方（可新增新条目：已注册企业/个人用户自动填充联系电话，未注册可直接输入）
 *        + 锁定空闲办公位 + 租期/租金/联系人，新增成功后办公位转为已分配；
 * 编辑 = 仅调整租期/租金/联系人/备注（换办公位/换租赁方需终止原租约后重建），
 *        提交时必填编辑原因，服务端追加编辑记录 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  lease: Lease | null
  workstations: Workstation[]
  /** 新增模式预选办公位（「关联租赁」从办公位/办公室卡片跳转带入） */
  presetWorkstationIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
/* 租赁方原始数据（用于选项渲染与联系电话自动填充） */
const renterUsers = ref<{ uid: string; nickname: string; phone: string }[]>([])
const renterEnterprises = ref<{ id: string; name: string; contactName: string; contactPhone: string }[]>([])

const form = reactive({
  /* 选择器的值：E:企业ID / U:用户ID / 自定义文本（未注册租赁方名称） */
  renterValue: '',
  enterpriseId: '',
  enterpriseName: '',
  renterType: 'enterprise' as LeaseRenterType,
  workstationIds: [] as string[],
  startDate: '',
  endDate: '',
  longTerm: false,
  monthlyRent: 800 as number | undefined,
  rentPeriod: 'month' as RentPeriod,
  contactName: '',
  contactPhone: '',
  note: '',
  reason: '',
})

/* 付款周期选项与标签（单位用于"租金（元）/ N"动态标签） */
const rentPeriodOptions = [
  { label: '日付', value: 'day' },
  { label: '周付', value: 'week' },
  { label: '月付', value: 'month' },
  { label: '年付', value: 'year' },
]
const rentPeriodLabelMap: Record<RentPeriod, string> = { day: '日', week: '周', month: '月', year: '年' }
const rentPeriodLabel = computed(() => rentPeriodLabelMap[form.rentPeriod])

/* 办公位树选择：一级=已有区域，二级=该区域下的空闲办公位编号 */
const workstationTree = computed(() => {
  const groups: { label: string; value: string; children: { label: string; value: string }[] }[] = []
  for (const w of props.workstations) {
    if (w.status !== 'idle') continue
    let g = groups.find((x) => x.value === w.area)
    if (!g) {
      g = { label: w.area, value: w.area, children: [] }
      groups.push(g)
    }
    g.children.push({ label: `${w.seatNo}（${workstationTypeMap[w.type] ?? w.type}）`, value: w.id })
  }
  return groups
})

/* 租赁方选项：全部企业 + 全部个人用户；配合 creatable 支持直接输入未注册租赁方 */
const renterOptions = computed(() => [
  ...renterEnterprises.value.map((e) => ({ label: `${e.name}（企业 · ${e.id}）`, value: `E:${e.id}` })),
  ...renterUsers.value.map((u) => ({ label: `${u.nickname}（个人用户 · ${u.uid}）`, value: `U:${u.uid}` })),
])

/* 选择值变化 → 解析租赁方并自动填充联系电话（未注册条目不填充，联系人手动输入）；
 * 编辑态租赁方不可变更，跳过该联动，避免用选项表覆盖回填的租约快照 */
watch(
  () => form.renterValue,
  (v) => {
    if (props.mode !== 'create') return
    if (v.startsWith('E:')) {
      const e = renterEnterprises.value.find((x) => `E:${x.id}` === v)
      if (!e) return
      form.enterpriseId = e.id
      form.enterpriseName = e.name
      form.renterType = 'enterprise'
      form.contactName = e.contactName
      form.contactPhone = e.contactPhone
    } else if (v.startsWith('U:')) {
      const u = renterUsers.value.find((x) => `U:${x.uid}` === v)
      if (!u) return
      form.enterpriseId = u.uid
      form.enterpriseName = u.nickname
      form.renterType = 'individual'
      form.contactName = u.nickname
      form.contactPhone = u.phone
    } else if (v) {
      /* creatable 自建条目：值即名称 */
      form.enterpriseId = ''
      form.enterpriseName = v
      form.renterType = 'custom'
    }
  },
)

/* 租金联动：非"月租"周期清除租金输入框；"月租"且所选办公位存在默认月租时自动累加求和填入（仅新增模式） */
watch([() => form.workstationIds, () => form.rentPeriod], () => {
  if (props.mode !== 'create') return
  if (form.rentPeriod !== 'month') {
    form.monthlyRent = undefined
    return
  }
  const sum = props.workstations
    .filter((w) => form.workstationIds.includes(w.id) && w.defaultMonthlyRent != null)
    .reduce((s, w) => s + (w.defaultMonthlyRent ?? 0), 0)
  if (sum > 0) form.monthlyRent = sum
})

/* 编辑模式回显：按 renterType 还原（旧数据按 ID 前缀推断） */
function renterValueOf(lease: Lease): string {
  if (lease.renterType === 'individual' || (!lease.renterType && lease.enterpriseId.startsWith('U')))
    return `U:${lease.enterpriseId}`
  if (lease.renterType === 'custom') return lease.enterpriseName
  return `E:${lease.enterpriseId}`
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    try {
      const opts = await fetchRenterOptions()
      renterUsers.value = opts.users
      renterEnterprises.value = opts.enterprises
    } catch {
      MessagePlugin.error('租赁方选项加载失败')
    }
    if (props.mode === 'edit' && props.lease) {
      form.renterValue = renterValueOf(props.lease)
      form.enterpriseId = props.lease.enterpriseId
      form.enterpriseName = props.lease.enterpriseName
      form.renterType = props.lease.renterType ?? (props.lease.enterpriseId.startsWith('U') ? 'individual' : 'enterprise')
      form.workstationIds = [...props.lease.workstationIds]
      form.startDate = props.lease.startDate
      form.endDate = props.lease.endDate
      form.longTerm = props.lease.longTerm ?? false
      form.monthlyRent = props.lease.monthlyRent
      form.rentPeriod = props.lease.rentPeriod ?? 'month'
      form.contactName = props.lease.contactName
      form.contactPhone = props.lease.contactPhone
      form.note = props.lease.note ?? ''
      form.reason = ''
    } else {
      form.renterValue = ''
      form.enterpriseId = ''
      form.enterpriseName = ''
      form.renterType = 'enterprise'
      form.workstationIds = props.presetWorkstationIds?.length ? [...props.presetWorkstationIds] : []
      form.startDate = ''
      form.endDate = ''
      form.longTerm = false
      form.monthlyRent = 800
      form.rentPeriod = 'month'
      form.contactName = ''
      form.contactPhone = ''
      form.note = ''
      form.reason = ''
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules = computed<FormProps['rules']>(() => ({
  renterValue: [{ required: true, message: '请选择或输入租赁方', trigger: 'submit' }],
  workstationIds: [{ required: true, message: '请选择至少一个空闲办公位', trigger: 'submit' }],
  startDate: [{ required: true, message: '请选择租赁开始日期', trigger: 'submit' }],
  contactName: [{ required: true, message: '请输入联系人', trigger: 'submit' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'submit' }],
  monthlyRent: [{ required: true, message: '请输入租金', trigger: 'submit' }],
  ...(props.mode === 'edit'
    ? { reason: [{ required: true, message: '请填写编辑原因', trigger: 'submit' }] }
    : {}),
}))

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  /* 非"长期"租约必须填写结束日期 */
  if (!form.longTerm && !form.endDate) {
    MessagePlugin.error('请选择租赁结束日期，或开启"长期"开关')
    return
  }
  if (!form.longTerm && form.endDate < form.startDate) {
    MessagePlugin.error('租赁结束日期不能早于开始日期')
    return
  }
  submitting.value = true
  try {
    /* required 规则已拦截空值，此处兜底窄化类型 */
    if (form.monthlyRent == null) {
      MessagePlugin.error('请输入租金')
      return
    }
    if (props.mode === 'create') {
      const lease = await createLease({
        enterpriseId: form.enterpriseId,
        enterpriseName: form.enterpriseName,
        renterType: form.renterType,
        workstationIds: form.workstationIds,
        startDate: form.startDate,
        endDate: form.longTerm ? '' : form.endDate,
        longTerm: form.longTerm,
        monthlyRent: form.monthlyRent,
        rentPeriod: form.rentPeriod,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        note: form.note.trim() || undefined,
      })
      MessagePlugin.success(`租约已新增，所选办公位已分配（${lease.id}）`)
    } else if (props.lease) {
      await updateLease(props.lease.id, {
        startDate: form.startDate,
        endDate: form.longTerm ? '' : form.endDate,
        longTerm: form.longTerm,
        monthlyRent: form.monthlyRent,
        rentPeriod: form.rentPeriod,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        note: form.note.trim() || undefined,
        reason: form.reason.trim(),
      })
      MessagePlugin.success('租约修改已保存')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'create' ? '新增租约 · 分配办公位' : '编辑租约'"
    width="880px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认新增' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <div class="form-row">
        <t-form-item label="租赁方" name="renterValue">
          <t-input
            v-if="mode === 'edit'"
            :value="form.enterpriseName"
            disabled
            placeholder="租赁方不可变更…"
          />
          <t-select
            v-else
            v-model="form.renterValue"
            :options="renterOptions"
            placeholder="选择已注册的企业/个人用户，或直接输入新租赁方…"
            filterable
            creatable
            style="width: 100%"
          />
        </t-form-item>
      </div>
      <t-form-item v-if="mode === 'create'" label="选择办公位（仅空闲）" name="workstationIds">
        <t-tree-select
          v-model="form.workstationIds"
          :data="workstationTree"
          multiple
          clearable
          filterable
          :min-collapsed-num="3"
          placeholder="按区域分组；可多选，独立办公室支持整间分配…"
        />
      </t-form-item>
      <div v-else class="edit-tip">换办公位需终止原租约后重新新增（编辑仅支持租期/租金/联系人）</div>
      <div class="form-row">
        <t-form-item label="租赁开始日期" name="startDate">
          <t-date-picker clearable v-model="form.startDate" valueType="YYYY-MM-DD" style="width: 100%" />
        </t-form-item>
        <t-form-item label="租赁结束日期" name="endDate">
          <div class="end-date-row">
            <t-date-picker
              v-model="form.endDate"
              valueType="YYYY-MM-DD"
              :disabled="form.longTerm"
              style="flex: 1"
            />
            <div class="long-term-switch">
              <t-switch v-model="form.longTerm" />
              <span class="long-term-text">长期</span>
            </div>
          </div>
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="付款周期" name="rentPeriod">
          <t-radio-group
            v-model="form.rentPeriod"
            :options="rentPeriodOptions"
            theme="button"
            variant="primary-filled"
            class="rent-period-group"
          />
        </t-form-item>
        <t-form-item :label="`租金（元）/ ${rentPeriodLabel}`" name="monthlyRent">
          <t-input-number v-model="form.monthlyRent" :min="0" theme="column" style="width: 100%" placeholder="月租周期选办公位后可自动累加…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="联系人" name="contactName">
          <t-input clearable v-model="form.contactName" />
        </t-form-item>
        <t-form-item label="联系电话" name="contactPhone">
          <t-input clearable v-model="form.contactPhone" name="contact-phone" type="tel" inputmode="tel" autocomplete="tel" />
        </t-form-item>
      </div>
      <t-form-item label="备注" name="note">
        <t-textarea
          v-model="form.note"
          :maxlength="255"
          :autosize="{ minRows: 2, maxRows: 3 }"
          placeholder="租约补充说明等（选填）…"
        />
      </t-form-item>
      <t-form-item v-if="mode === 'edit'" label="编辑原因" name="reason">
        <t-textarea
          v-model="form.reason"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="请填写本次修改的原因（必填，将记入编辑记录）…"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.rent-period-group {
  display: flex;
  width: 100%;
}

.rent-period-group :deep(.t-radio-button) {
  flex: 1;
  justify-content: center;
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.edit-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}

.end-date-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.long-term-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.long-term-text {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  white-space: nowrap;
}
</style>
