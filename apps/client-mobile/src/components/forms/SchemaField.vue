<script setup lang="ts">
import { Cell, Input, Textarea, Upload } from 'tdesign-mobile-vue'
import type { RequestMethodResponse, UploadFile } from 'tdesign-mobile-vue'
import type { ApplicationFormField } from '@/types'

/* 申请表单单字段渲染：text/number/textarea/select/date/upload（schema 驱动）。 */
withDefaults(
  defineProps<{
    field: ApplicationFormField
    modelValue: string
    files?: UploadFile[]
    error?: string
    requestUpload?: (files: UploadFile | UploadFile[]) => Promise<RequestMethodResponse>
  }>(),
  { files: () => [], error: '', requestUpload: undefined },
)

const emit = defineEmits<{
  'update:modelValue': [string]
  'update:files': [UploadFile[]]
  openPicker: []
  openDate: []
}>()

function withPreviewUrls(files: UploadFile[]): UploadFile[] {
  return files.map((file) => {
    const url = String(file.response?.url ?? file.url ?? '')
    return url && url !== file.url ? { ...file, url } : file
  })
}

function updateFiles(files: UploadFile[]) {
  emit('update:files', withPreviewUrls(files))
}

function onUploadSuccess(context: { fileList?: UploadFile[] }) {
  if (context.fileList) updateFiles(context.fileList)
}

function optionLabel(field: ApplicationFormField, value: string): string {
  return field.options?.find((option) => option.value === value)?.label ?? ''
}
</script>

<template>
  <div class="field">
    <label v-if="field.type === 'text' || field.type === 'number' || field.type === 'textarea'">
      {{ field.label }}<span v-if="field.required" class="req"> *</span>
    </label>
    <span v-else class="field-label">{{ field.label }}<span v-if="field.required" class="req"> *</span></span>

    <Input
      v-if="field.type === 'text' || field.type === 'number'"
      :model-value="modelValue"
      :type="field.type === 'number' ? 'number' : 'text'"
      :maxlength="field.maxlength"
      :placeholder="field.placeholder"
      clearable
      @update:model-value="(value: string | number) => $emit('update:modelValue', String(value))"
    />

    <Textarea
      v-else-if="field.type === 'textarea'"
      :model-value="modelValue"
      :autosize="{ minRows: 4, maxRows: 10 }"
      :maxlength="field.maxlength"
      :placeholder="field.placeholder"
      @update:model-value="(value: string | number) => $emit('update:modelValue', String(value))"
    />

    <Cell
      v-else-if="field.type === 'select'"
      class="picker-cell"
      :bordered="false"
      :title="optionLabel(field, modelValue) || field.placeholder || '请选择'"
      :class="{ empty: !modelValue }"
      arrow
      @click="$emit('openPicker')"
    />

    <Cell
      v-else-if="field.type === 'date'"
      class="picker-cell"
      :bordered="false"
      :title="modelValue || '请选择日期'"
      :class="{ empty: !modelValue }"
      arrow
      @click="$emit('openDate')"
    />

    <Upload
      v-else-if="field.type === 'upload'"
      :files="files"
      theme="grid"
      :accept="field.accept"
      :multiple="field.multiple === true"
      :max="field.maxCount ?? 1"
      :size-limit="{ size: 10, unit: 'MB' }"
      :request-method="requestUpload"
      @update:files="updateFiles"
      @success="onUploadSuccess"
    />

    <p v-if="error" class="field-error">{{ error }}</p>
    <p v-if="field.help" class="help">{{ field.help }}</p>
  </div>
</template>

<style scoped>
.field {
  margin-bottom:var(--app-space-10);
  padding-bottom:var(--app-space-9);
  border-bottom: 1px solid var(--td-component-border);
}

.field:last-of-type {
  margin-bottom:var(--app-space-7);
  padding-bottom:0;
  border-bottom: 0;
}

.field label,
.field .field-label {
  display: block;
  margin-bottom:var(--app-space-4);
  font: var(--app-type-body);
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
  font: var(--app-type-body);
}

.picker-cell.empty :deep(.t-cell__title) {
  color: var(--td-text-color-placeholder);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

.help {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
