<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, DateTimePicker, Input, Loading, Picker, Popup, Textarea, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { createApplication, fetchApplicationFormSchema } from '@/api/applications'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { ApplicationFormField, ApplicationFormSchema, ApplicationType, UploadedFileInfo } from '@/types'

/* schema 驱动的申请表单渲染器（缺口 §7.1-14 自定义字段 + §7.1-6 资料上传）。
 * 三个独立流程页（企业入驻/合作伙伴/人才登记）各自引入本组件，字段来自 mock schema。 */
const props = defineProps<{ type: ApplicationType }>()
const router = useRouter()

const schema = ref<ApplicationFormSchema | null>(null)
const loading = ref(true)
const error = ref('')
const submitting = ref(false)

const values = reactive<Record<string, string>>({})
const filesMap = reactive<Record<string, UploadFile[]>>({})

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
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '表单加载失败，请稍后重试'
  } finally {
    loading.value = false
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
const todayStr = (() => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()

function openDate(f: ApplicationFormField) {
  dateField.value = f
  dateValue.value = values[f.key] || todayStr
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

async function onSubmit() {
  const s = schema.value
  if (!s) return
  for (const f of s.fields) {
    if (f.type === 'upload') {
      if (f.required && uploadedOf(f).length === 0) {
        Toast(`请上传${f.label}`)
        return
      }
      continue
    }
    if (f.required && !values[f.key]?.trim()) {
      Toast(f.type === 'select' || f.type === 'date' ? `请选择${f.label}` : `请填写${f.label}`)
      return
    }
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
    await createApplication({ type: props.type, fields })
    Toast('申请已提交，审核结果将站内信通知')
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
    <EmptyBlock v-else-if="error" :text="error" />

    <template v-else-if="schema">
      <header class="head">
        <h1 class="title">{{ schema.title }}</h1>
        <p class="subtitle">{{ schema.subtitle }}</p>
      </header>

      <div v-if="schema.tips?.length" class="m-card tips">
        <p v-for="(t, i) in schema.tips" :key="i" class="tip-line">· {{ t }}</p>
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

          <p v-if="f.help" class="help">{{ f.help }}</p>
        </div>

        <Button theme="primary" size="large" block class="submit" :loading="submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : schema.submitLabel }}
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

.head .title {
  margin: 0 0 4px;
  font-size: 20px;
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
  padding: 12px 14px;
}

.tip-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom: 16px;
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

.picker-cell.empty :deep(.t-cell__title) {
  color: var(--td-text-color-placeholder);
}

.help {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.submit {
  margin-top: 4px;
}
</style>
