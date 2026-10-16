<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import { createEnterprise, updateEnterprise, type EnterprisePayload } from '@/api/enterprises'
import { fetchPublisherOptions } from '@/api/demands'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { userSubjectLabel } from '@/utils/subjectLabel'
import type { Enterprise } from '@/types'

/* 社区企业新增/编辑弹窗：
 * 新增 = 管理员手动新增（新增即正常态）；编辑 = 可改企业名称/行业/规模/入驻类型/成立时间/联系人等。
 * 社区企业必须关联一个个人用户（作为联系人），选择后自动填充联系电话、联系邮箱（服务端亦按用户解析）。 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  enterprise: Enterprise | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()

/* 行业选项来自数据字典，加载失败回退默认词表 */
const industryLoaded = ref(false)
const industryLoadError = ref('')
const industryLoading = ref(false)
const industryOptions = ref(dictFallback.industry.map((label) => ({ label, value: label })))

async function loadIndustryOptions() {
  if (industryLoading.value) return
  industryLoading.value = true
  try {
    const entries = await fetchDictEntries('industry')
    industryOptions.value = entries.filter((entry) => entry.status === 'enabled').map((entry) => ({ label: entry.label, value: entry.label }))
    industryLoaded.value = true
    industryLoadError.value = ''
  } catch {
    industryLoadError.value = '行业字典加载失败，当前显示默认选项。'
  } finally {
    industryLoading.value = false
  }
}

/* 规模选项（与企业规模枚举一致） */
const sizeOptions = [
  { label: '10人以下', value: '10人以下' },
  { label: '10-50人', value: '10-50人' },
  { label: '50-100人', value: '50-100人' },
  { label: '100人以上', value: '100人以上' },
]

/* 入驻类型选项 */
const leaseTypeOptions = [
  { label: '独立办公室', value: '独立办公室' },
  { label: '开放办公位', value: '开放办公位' },
  { label: '半开放办公位', value: '半开放办公位' },
  { label: '虚拟入驻', value: '虚拟入驻' },
]

/* 关联用户选项（仅个人用户；选项与「新增需求」需求方的用户部分一致） */
const contactUsers = ref<{ uid: string; nickname: string; realName: string; phone: string; email: string; tag: string }[]>([])
const contactOptions = ref<{ label: string; value: string }[]>([])
const contactLoadError = ref('')
const contactLoading = ref(false)

const form = reactive({
  name: '',
  industry: '',
  size: '',
  leaseType: '',
  /** 关联用户 UID（必填） */
  contactUserId: '',
  /** 联系人职位（展示于成员管理） */
  contactTitle: '',
  contactName: '',
  contactPhone: '',
  foundedAt: '',
  contactEmail: '',
  description: '',
})

/* 选择关联用户 → 自动填充联系人姓名/联系电话/联系邮箱 */
function applyContactUser(uid: string) {
  form.contactUserId = uid
  const u = contactUsers.value.find((x) => x.uid === uid)
  if (!u) return
  form.contactName = u.realName || u.nickname
  form.contactPhone = u.phone
  form.contactEmail = u.email || ''
}

async function loadContactOptions() {
  if (contactLoading.value) return
  contactLoading.value = true
  try {
    const opts = await fetchPublisherOptions()
    contactUsers.value = opts.users
    contactOptions.value = opts.users.map((u) => ({ label: userSubjectLabel({ realName: u.realName, nickname: u.nickname, uid: u.uid, identity: u.tag }), value: u.uid }))
    contactLoadError.value = ''
  } catch {
    contactLoadError.value = '关联用户选项加载失败，请重试后选择联系人。'
  } finally {
    contactLoading.value = false
  }
}

function resetForm() {
  if (props.mode === 'edit' && props.enterprise) {
    form.name = props.enterprise.name
    form.industry = props.enterprise.industry
    form.size = props.enterprise.size
    form.leaseType = props.enterprise.leaseType
    form.contactUserId = props.enterprise.contactUserId ?? ''
    form.contactTitle = props.enterprise.contactTitle ?? ''
    form.contactName = props.enterprise.contactName
    form.contactPhone = props.enterprise.contactPhone
    form.foundedAt = props.enterprise.foundedAt
    form.contactEmail = props.enterprise.contactEmail ?? ''
    form.description = props.enterprise.description
  } else {
    form.name = ''
    form.industry = ''
    form.size = ''
    form.leaseType = ''
    form.contactUserId = ''
    form.contactTitle = ''
    form.contactName = ''
    form.contactPhone = ''
    form.foundedAt = ''
    form.contactEmail = ''
    form.description = ''
  }
}

const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(() => ({ ...form }))
usePageDirtyGuard(computed(() => props.visible && isDirty.value))

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    resetForm()
    markBaseline()
    if (contactOptions.value.length === 0) loadContactOptions()
    if (!industryLoaded.value) void loadIndustryOptions()
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入企业名称', trigger: 'submit' }],
  industry: [{ required: true, message: '请选择行业', trigger: 'submit' }],
  size: [{ required: true, message: '请选择规模', trigger: 'submit' }],
  leaseType: [{ required: true, message: '请选择入驻类型', trigger: 'submit' }],
  contactUserId: [{ required: true, message: '请选择关联用户', trigger: 'submit' }],
}

function payload(): EnterprisePayload {
  return {
    name: form.name.trim(),
    industry: form.industry,
    size: form.size,
    leaseType: form.leaseType,
    contactUserId: form.contactUserId,
    contactTitle: form.contactTitle.trim() || undefined,
    contactName: form.contactName,
    contactPhone: form.contactPhone,
    foundedAt: form.foundedAt || undefined,
    contactEmail: form.contactEmail.trim() || undefined,
    description: form.description.trim() || undefined,
  }
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    if (props.mode === 'create') {
      const res = await createEnterprise(payload())
      MessagePlugin.success(`企业已新增（${res.id}）`)
    } else if (props.enterprise) {
      await updateEnterprise(props.enterprise.id, payload())
      MessagePlugin.success('企业信息已保存')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  if (submitting.value) return
  guardClose(() => emit('update:visible', false))
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'create' ? '新增企业' : '编辑企业'"
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

    <t-alert v-if="industryLoadError" theme="warning" :message="industryLoadError" style="margin-bottom: 16px">
      <template #operation><t-button variant="text" :loading="industryLoading" @click="loadIndustryOptions">重新加载行业</t-button></template>
    </t-alert>
    <t-alert v-if="contactLoadError" theme="warning" :message="contactLoadError" style="margin-bottom: 16px">
      <template #operation><t-button variant="text" :loading="contactLoading" @click="loadContactOptions">重新加载用户</t-button></template>
    </t-alert>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="企业名称" name="name">
        <t-input v-accessible-field v-model="form.name" clearable placeholder="请输入企业名称…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="行业" name="industry">
          <t-select v-accessible-field v-model="form.industry" :options="industryOptions" clearable filterable placeholder="选择行业…" />
        </t-form-item>
        <t-form-item label="规模" name="size">
          <t-select v-accessible-field v-model="form.size" :options="sizeOptions" clearable placeholder="选择规模…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="入驻类型" name="leaseType">
          <t-select v-accessible-field v-model="form.leaseType" :options="leaseTypeOptions" clearable placeholder="选择入驻类型…" />
        </t-form-item>
        <t-form-item label="成立时间" name="foundedAt">
          <t-date-picker v-accessible-field v-model="form.foundedAt" valueType="YYYY-MM" clearable class="ctl-w-full" />
        </t-form-item>
      </div>
      <t-form-item label="联系人（关联用户）" name="contactUserId">
        <t-select
          v-accessible-field
          v-model="form.contactUserId"
          :options="contactOptions"
          filterable
          clearable
          style="width: calc(50% - 8px)"
          placeholder="选择已注册的个人用户作为联系人…"
          @change="(val: unknown) => applyContactUser(String(val ?? ''))"
        />
      </t-form-item>
      <t-form-item label="职位" name="contactTitle">
        <t-input v-accessible-field v-model="form.contactTitle" clearable placeholder="联系人在企业的职位，如 创始人 & CEO（选填）…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="联系电话" name="contactPhone">
          <t-input v-accessible-field v-model="form.contactPhone" name="contact-phone" type="tel" inputmode="tel" autocomplete="tel" disabled placeholder="选择联系人后自动填充…" />
        </t-form-item>
        <t-form-item label="联系邮箱" name="contactEmail">
          <t-input v-accessible-field v-model="form.contactEmail" name="contact-email" inputmode="email" autocomplete="email" disabled placeholder="选择联系人后自动填充…" />
        </t-form-item>
      </div>
      <t-form-item label="企业简介" name="description">
        <t-textarea
          v-accessible-field
          v-model="form.description"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="选填…"
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
</style>
