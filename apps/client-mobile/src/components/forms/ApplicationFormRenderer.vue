<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DateTimePicker, Picker, Popup, Toast } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { createApplication, fetchApplicationFormSchema, fetchMyApplicationPayload, resubmitApplication } from '@/api/applications'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import SchemaField from '@/components/forms/SchemaField.vue'
import FlowResult from '@/components/FlowResult.vue'
import type { ApplicationCreatePayload, ApplicationFormField, ApplicationFormSchema, ApplicationType, UploadedFileInfo } from '@/types'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDate } from '@/utils/format'

/* schema 驱动的申请表单渲染器（服务端下发自定义字段并提供资料上传）。
 * 三个独立流程页（企业入驻/合作伙伴/人才登记）各自引入本组件，字段来自服务端下发的 schema；
 * v34 支持 ?revise=<申请 id> 修改重提（附件需重新上传）。 */
const props = defineProps<{ type: ApplicationType }>()
const router = useRouter()
const route = useRoute()
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)

const schema = ref<ApplicationFormSchema | null>(null)
const loading = ref(true)
const error = ref('')
const submitting = ref(false)
const submittedId = ref('')

const values = reactive<Record<string, string>>({})
const filesMap = reactive<Record<string, UploadFile[]>>({})
const uploadingFiles = computed(() => Object.values(filesMap).some((files) => files.some((file) => file.status === 'waiting' || file.status === 'progress')))
const failedFiles = computed(() => Object.values(filesMap).some((files) => files.some((file) => file.status === 'fail')))

const loaded = ref(false)
const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify({
  values,
  files: Object.fromEntries(Object.entries(filesMap).map(([key, files]) => [
    key,
    files.map((file) => ({ name: file.name, status: file.status, url: file.response?.url ?? file.url })),
  ])),
}))
const { markClean } = useUnsavedGuard(() => loaded.value && !submittedId.value && formSnapshot.value !== baseline.value)

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
    baseline.value = formSnapshot.value
    loaded.value = true
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
  if (pickerField.value) setFieldValue(pickerField.value.key, String(val[0] ?? ''))
  pickerVisible.value = false
}

/* ---- date：DateTimePicker 弹层 ---- */
const dateField = ref<ApplicationFormField | null>(null)
const dateVisible = ref(false)
const dateValue = ref('')
const businessNowMs = useBusinessNow()
const todayStr = computed(() => formatLocalDate(businessNowMs.value))

function openDate(f: ApplicationFormField) {
  dateField.value = f
  dateValue.value = values[f.key] || todayStr.value
  dateVisible.value = true
}

function onDateConfirm(val: unknown) {
  if (dateField.value) setFieldValue(dateField.value.key, String(val))
  dateVisible.value = false
}

/* ---- upload：POST /api/app/uploads，返回可访问的 URL ---- */
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

function setFieldValue(key: string, value: string) {
  values[key] = value
  delete fieldErrors[key]
}

function focusFirstError() {
  const key = Object.keys(fieldErrors)[0]
  if (!key) return
  void nextTick(() => {
    const field = document.querySelector<HTMLElement>(`[data-field-key="${CSS.escape(key)}"]`)
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    field?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, [role="button"]')?.focus({ preventScroll: true })
  })
}

async function onSubmit() {
  if (submitting.value) return
  if (uploadingFiles.value) {
    Toast('附件仍在上传，请等待上传完成')
    return
  }
  if (failedFiles.value) {
    Toast('有附件上传失败，请重试或移除后再提交')
    return
  }
  const s = schema.value
  if (!s) return
  Object.keys(fieldErrors).forEach((key) => delete fieldErrors[key])
  /* v45：一次性跑完全部字段校验并汇总，避免逐个报错、用户反复提交 N 次 */
  const messages: string[] = []
  for (const f of s.fields) {
    if (f.type === 'upload') {
      if (f.required && uploadedOf(f).length === 0) {
        fieldErrors[f.key] = `请上传${f.label}`
        messages.push(fieldErrors[f.key])
      }
      continue
    }
    if (f.required && !values[f.key]?.trim()) {
      const message = f.type === 'select' || f.type === 'date' ? `请选择${f.label}` : `请填写${f.label}`
      fieldErrors[f.key] = message
      messages.push(message)
      continue
    }
    if (f.type === 'select' && values[f.key] && !f.options?.some((option) => option.value === values[f.key])) {
      fieldErrors[f.key] = `${f.label}的选项无效`
      messages.push(fieldErrors[f.key])
    }
  }
  if (messages.length) {
    Toast(messages.length === 1 ? messages[0] : `还有 ${messages.length} 项待完善，请检查表单`)
    focusFirstError()
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
    if (revising.value) {
      await resubmitApplication(reviseId, payload)
      submittedId.value = reviseId
    } else {
      const result = await createApplication(payload)
      submittedId.value = result.id
    }
    baseline.value = formSnapshot.value
    markClean()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in apply-form">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />

    <FlowResult
      v-else-if="submittedId"
      :title="revising ? '申请已重新提交' : '申请已提交'"
      description="申请已进入审核队列，结果将通过站内信通知。"
      :reference="submittedId"
      primary-text="查看申请记录"
      secondary-text="返回我的"
      @primary="router.replace('/me/applications')"
      @secondary="router.replace('/me')"
    />

    <template v-else-if="schema">
      <header class="head">
        <p v-if="revising" class="revision-label">修改重提</p>
        <p class="subtitle">{{ revising ? '修改后将重新进入审核队列；附件需重新上传。' : schema.subtitle }}</p>
      </header>

      <div v-if="schema.tips?.length" class="m-card tips">
        <p class="tips-title">申请前请准备</p>
        <p v-for="(t, i) in schema.tips" :key="i" class="tip-line"><span>{{ String(i + 1).padStart(2, '0') }}</span>{{ t }}</p>
      </div>

      <div class="m-card form">
        <SchemaField
          v-for="f in schema.fields"
          :key="f.key"
          :field="f"
          :model-value="values[f.key] ?? ''"
          :files="filesMap[f.key] ?? []"
          :error="fieldErrors[f.key]"
          :request-upload="requestUpload"
          @update:model-value="(value: string) => setFieldValue(f.key, value)"
          @update:files="(value: UploadFile[]) => { filesMap[f.key] = value; if (value.length) delete fieldErrors[f.key] }"
          @open-picker="openPicker(f)"
          @open-date="openDate(f)"
        />

        <p v-if="uploadingFiles" class="field-help" role="status">附件上传完成后才能提交</p>

        <Button theme="primary" size="large" block class="submit mobile-sticky-action" :loading="submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : revising ? '重新提交' : schema.submitLabel }}
        </Button>
      </div>
    </template>

    <Popup v-model:visible="pickerVisible" placement="bottom">
      <!-- v52：弹层标题指名字段，用户可把弹层与具体字段对应（界面审查 LOW：标题命名动作与对象） -->
      <Picker
        v-model="pickerValue"
        :columns="[pickerField?.options ?? []]"
        :title="`请选择${pickerField?.label ?? ''}`"
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
        :title="`选择${dateField?.label ?? '日期'}`"
        @confirm="onDateConfirm"
        @cancel="dateVisible = false"
      />
    </Popup>
  </div>
</template>

<style scoped>
.apply-form {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.revision-label {
  width: fit-content;
  margin: 0 0 var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-4);
  border-radius: var(--td-radius-round);
  background: var(--td-warning-color-1);
  color: var(--td-warning-color);
  font: var(--app-type-caption);
}

.head {
  padding:var(--app-space-2) var(--app-space-1);
}

.head .subtitle {
  margin:0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.tips {
  border-left: var(--td-divider-border-width) solid var(--td-brand-color);
  padding:var(--app-space-7);
}

.tips-title {
  margin:0 0 var(--app-space-4);
  color: var(--td-text-color-primary);
  font: var(--app-type-card-title);
}

.tip-line {
  display: flex;
  gap:var(--app-space-4);
  margin:0 0 var(--app-space-2);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.tip-line span {
  color: var(--td-brand-color);
  font: var(--app-type-emphasis-sm);
}

.form {
  padding-top:var(--app-space-9);
}

.submit {
  margin-top:var(--app-space-4);
}
</style>
