<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, DateTimePicker, Input, Loading, Picker, Popup, Textarea, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { createApplication, fetchApplicationFormSchema, fetchMyApplicationPayload, resubmitApplication } from '@/api/applications'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { ApplicationCreatePayload, ApplicationFormField, ApplicationFormSchema, ApplicationType, IdentityType, UploadedFileInfo } from '@/types'
import { formatMockDate, mockClockVersion } from '@/mock/runtime'
import { useDraft } from '@/composables/useDraft'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'

/* schema 驱动的申请表单渲染器（缺口 §7.1-14 自定义字段 + §7.1-6 资料上传）。
 * 三个独立流程页（企业入驻/合作伙伴/人才登记）各自引入本组件，字段来自 mock schema；
 * v34 支持 ?revise=<申请 id> 修改重提（附件需重新上传）；v38 增加草稿与离开保护。 */
const props = defineProps<{ type: ApplicationType }>()
const router = useRouter()
const route = useRoute()
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)

const schema = ref<ApplicationFormSchema | null>(null)
const loading = ref(true)
const error = ref('')
const submitting = ref(false)

const values = reactive<Record<string, string>>({})
const filesMap = reactive<Record<string, UploadFile[]>>({})

/* v38 草稿与离开保护（附件不进入草稿） */
const { hasDraft: draftAvailable, savedAt: draftSavedAt, detect: detectDraft, restore: restoreDraft, discard: discardDraft, clear: clearDraft, rebase: rebaseDraft, dirty } = useDraft(
  `application-${props.type}`,
  () => ({ ...values }),
  (value) => Object.assign(values, value),
  { enabled: () => !revising.value, isEmpty: () => Object.values(values).every((item) => !item) },
)
useUnsavedGuard(() => dirty.value)

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchApplicationFormSchema(props.type)
    schema.value = data
    for (const f of data.fields) {
      values[f.key] = ''
      if (f.type === 'upload') filesMap[f.key] = []
    }
    if (reviseId) {
      const payload = await fetchMyApplicationPayload(reviseId)
      const fields = payload.fields ?? {}
      for (const f of data.fields) {
        if (f.type === 'upload') continue
        const value = fields[f.key]
        if (value !== undefined && value !== null && typeof value !== 'object') values[f.key] = String(value)
      }
    }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '表单加载失败，请稍后重试'
  } finally {
    loading.value = false
    rebaseDraft()
    if (!revising.value) detectDraft()
  }
}

/* ---- select：Picker 弹层 ---- */
const pickerField = ref<ApplicationFormField | null>(null)
const pickerVisible = ref(false)
const pickerValue = ref<(string | number)[]>([])

function openPicker(f: ApplicationFormField) {
  pickerField.value = f
  pickerValue.value = values[f.key] ? [values[f.key]] : [f.options?.[0]?.value ?? '']
  pickerVisible.value = true
}

function onPickerConfirm(val: (string | number)[]) {
  if (pickerField.value) values[pickerField.value.key] = String(val[0] ?? '')
  pickerVisible.value = false
}

function optionLabel(f: ApplicationFormField): string {
  return f.options?.find((o) => o.value === values[f.key])?.label ?? ''
}

/* ---- date：DateTimePicker 弹层 ---- */
const dateField = ref<ApplicationFormField | null>(null)
const dateVisible = ref(false)
const dateValue = ref('')
const todayStr = computed(() => {
  void mockClockVersion.value
  return formatMockDate()
})

function openDate(f: ApplicationFormField) {
  dateField.value = f
  dateValue.value = values[f.key] || todayStr.value
  dateVisible.value = true
}

function onDateConfirm(val: unknown) {
  if (dateField.value) values[dateField.value.key] = String(val)
  dateVisible.value = false
}

/* ---- upload：自定义上传（mock 转 data URL；接入期走 POST /api/app/uploads） ---- */
async function requestUpload(file: UploadFile | UploadFile[]) {
  const target = Array.isArray(file) ? file[0] : file
  const raw = target?.raw as File | undefined
  if (!raw) return { status: 'fail' as const, error: '文件读取失败，请重试', response: {} }
  try {
    const info = await uploadFile(raw, 'application')
    return {
      status: 'success' as const,
      response: { url: info.url, key: info.key, name: info.name, size: info.size, type: info.type },
    }
  } catch (e) {
    return { status: 'fail' as const, error: e instanceof ApiError ? e.message : '上传失败，请重试', response: {} }
  }
}

function uploadedOf(f: ApplicationFormField): UploadedFileInfo[] {
  return (filesMap[f.key] ?? [])
    .filter((file) => file.status === 'success')
    .map((file) => ({
      key: String(file.response?.key ?? ''),
      name: file.name ?? '',
      size: file.size ?? 0,
      type: file.type ?? '',
      url: String(file.response?.url ?? file.url ?? ''),
    }))
}

/* v38 行内校验：字段级错误 */
const fieldErrors = reactive<Record<string, string>>({})

async function onSubmit() {
  const s = schema.value
  if (!s) return
  Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key])
  for (const f of s.fields) {
    if (f.type === 'upload') {
      if (f.required && uploadedOf(f).length === 0) {
        fieldErrors[f.key] = `请上传${f.label}`
        Toast(`请上传${f.label}`)
        return
      }
      continue
    }
    if (f.required && !values[f.key]?.trim()) {
      const message = f.type === 'select' || f.type === 'date' ? `请选择${f.label}` : `请填写${f.label}`
      fieldErrors[f.key] = message
      Toast(message)
      return
    }
    if (f.type === 'select' && values[f.key] && !f.options?.some((option) => option.value === values[f.key])) {
      fieldErrors[f.key] = `${f.label}的选项无效`
      Toast(fieldErrors[f.key])
      return
    }
  }
  if (props.type === 'identity' && values.identityType === 'community_enterprise' && !values.orgName?.trim()) {
    fieldErrors.orgName = '请填写要绑定的社区企业名称'
    Toast(fieldErrors.orgName)
    return
  }
  const fields: Record<string, string | number | UploadedFileInfo[]> = {}
  for (const f of s.fields) {
    if (f.type === 'upload') {
      const list = uploadedOf(f)
      if (list.length) fields[f.key] = list
    } else if (f.type === 'number') {
      if (values[f.key]) fields[f.key] = Number(values[f.key])
    } else if (values[f.key]) {
      fields[f.key] = values[f.key]
    }
  }
  submitting.value = true
  try {
    const payload: ApplicationCreatePayload = { type: props.type, fields }
    if (props.type === 'identity') {
      payload.identityType = String(fields.identityType ?? '') as IdentityType
      payload.organizationName = typeof fields.orgName === 'string' ? fields.orgName.trim() || undefined : undefined
    }
    if (revising.value) {
      await resubmitApplication(reviseId, payload)
      Toast('已重新提交审核')
    } else {
      await createApplication(payload)
      Toast('申请已提交，审核结果将站内信通知')
    }
    clearDraft()
    await router.push('/me/applications')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in apply-form">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />

    <template v-else-if="schema">
      <header class="head">
        <h1 class="title">{{ revising ? `修改重提 · ${schema.title}` : schema.title }}</h1>
        <p class="subtitle">{{ revising ? '修改后将重新进入审核队列；附件需重新上传。' : schema.subtitle }}</p>
      </header>

      <div v-if="draftAvailable && !revising" class="draft-bar">
        <span>检测到 {{ draftSavedAt }} 的未保存草稿</span>
        <a v-pressable @click="restoreDraft">恢复</a>
        <a v-pressable @click="discardDraft">放弃</a>
      </div>

      <div v-if="schema.tips?.length" class="m-card tips">
        <p class="tips-title">申请前请准备</p>
        <p v-for="(t, i) in schema.tips" :key="i" class="tip-line"><span>{{ String(i + 1).padStart(2, '0') }}</span>{{ t }}</p>
      </div>

      <div class="m-card form">
        <div v-for="f in schema.fields" :key="f.key" class="field">
          <label v-if="f.type === 'text' || f.type === 'number' || f.type === 'textarea'">
            {{ f.label }}<span v-if="f.required" class="req"> *</span>
          </label>
          <span v-else class="field-label">{{ f.label }}<span v-if="f.required" class="req"> *</span></span>

          <Input
            v-if="f.type === 'text' || f.type === 'number'"
            v-model="values[f.key]"
            :type="f.type === 'number' ? 'number' : 'text'"
            :maxlength="f.maxlength"
            :placeholder="f.placeholder"
            clearable
          />

          <Textarea
            v-else-if="f.type === 'textarea'"
            v-model="values[f.key]"
            :autosize="{ minRows: 4, maxRows: 10 }"
            :maxlength="f.maxlength"
            :placeholder="f.placeholder"
          />

          <Cell
            v-else-if="f.type === 'select'"
            class="picker-cell"
            :bordered="false"
            :title="optionLabel(f) || f.placeholder || '请选择'"
            :class="{ empty: !values[f.key] }"
            arrow
            @click="openPicker(f)"
          />

          <Cell
            v-else-if="f.type === 'date'"
            class="picker-cell"
            :bordered="false"
            :title="values[f.key] || '请选择日期'"
            :class="{ empty: !values[f.key] }"
            arrow
            @click="openDate(f)"
          />

          <Upload
            v-else-if="f.type === 'upload'"
            v-model:files="filesMap[f.key]"
            theme="grid"
            :accept="f.accept"
            :multiple="f.multiple === true"
            :max="f.maxCount ?? 1"
            :size-limit="{ size: 10, unit: 'MB' }"
            :request-method="requestUpload"
          />

          <p v-if="fieldErrors[f.key]" class="field-error">{{ fieldErrors[f.key] }}</p>
          <p v-if="f.help" class="help">{{ f.help }}</p>
        </div>

        <Button theme="primary" size="large" block class="submit" :loading="submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : revising ? '重新提交' : schema.submitLabel }}
        </Button>
      </div>
    </template>

    <Popup v-model:visible="pickerVisible" placement="bottom">
      <Picker
        v-model="pickerValue"
        :columns="[pickerField?.options ?? []]"
        title="请选择"
        @confirm="onPickerConfirm"
        @cancel="pickerVisible = false"
      />
    </Popup>

    <Popup v-model:visible="dateVisible" placement="bottom">
      <DateTimePicker
        v-model="dateValue"
        mode="date"
        format="YYYY-MM-DD"
        :start="todayStr"
        title="选择日期"
        @confirm="onDateConfirm"
        @cancel="dateVisible = false"
      />
    </Popup>
  </div>
</template>

<style scoped>
.apply-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.draft-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--td-radius-default);
  background: var(--td-warning-color-1, #fff1e9);
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.draft-bar a {
  color: var(--td-brand-color);
  cursor: pointer;
}

.draft-bar a:first-of-type {
  margin-left: auto;
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.head .title {
  margin: 0 0 4px;
  font-size: 20px;
}

.head {
  padding: 4px 2px;
}

.head .subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.state {
  padding: 32px 0;
}

.tips {
  border-left: 3px solid var(--td-brand-color);
  padding: 14px;
}

.tips-title {
  margin: 0 0 8px;
  color: var(--td-text-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.tip-line {
  display: flex;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.tip-line span {
  color: var(--td-brand-color);
  font-size: 12px;
  font-weight: 600;
}

.form {
  padding-top: 18px;
}

.field {
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--td-component-border);
}

.field:last-of-type {
  margin-bottom: 14px;
  padding-bottom: 0;
  border-bottom: 0;
}

.field label,
.field .field-label {
  display: block;
  margin-bottom: 7px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.req {
  color: var(--td-error-color);
}

.picker-cell {
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

.picker-cell :deep(.t-cell__title) {
  font-size: 14px;
}

.picker-cell.empty :deep(.t-cell__title) {
  color: var(--td-text-color-placeholder);
}

.help {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.submit {
  margin-top: 8px;
}
</style>
