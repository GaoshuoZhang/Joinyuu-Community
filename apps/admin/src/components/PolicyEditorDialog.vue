<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import RichEditor from '@/components/RichEditor.vue'
import type { AgreementPolicyPayload, CommunityPolicyPayload, PolicyAttachment, PolicyRecord } from '@/api/policies'

const props = defineProps<{
  visible: boolean
  mode: 'community' | 'agreement'
  record?: PolicyRecord | null
  submitting?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'save', value: CommunityPolicyPayload | AgreementPolicyPayload): void
}>()

interface EditorForm {
  kind: 'agreement_user' | 'agreement_privacy'
  category: string
  title: string
  summary: string
  content: string
  version: string
  effectiveAt: string
  attachments: PolicyAttachment[]
  featured: boolean
  status: 'published' | 'archived'
}

const formRef = ref()
const form = reactive<EditorForm>({
  kind: 'agreement_user',
  category: '',
  title: '',
  summary: '',
  content: '',
  version: '',
  effectiveAt: '',
  attachments: [],
  featured: false,
  status: 'published',
})

const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
function onClose() {
  if (props.submitting) return
  guardClose(() => emit('update:visible', false))
}

const rules = computed<FormProps['rules']>(() => ({
  ...(props.mode === 'community' ? { category: [{ required: true, message: '请填写政策分类', trigger: 'submit' }] } : {}),
  title: [{ required: true, message: '请填写标题', trigger: 'submit' }],
  version: [{ required: true, message: '请填写版本号', trigger: 'submit' }],
  content: [{ required: true, message: '请填写正文', trigger: 'submit' }],
}))

watch(
  () => [props.visible, props.record] as const,
  ([visible, record]) => {
    if (!visible) return
    Object.assign(form, {
      kind: record?.kind === 'agreement_privacy' ? 'agreement_privacy' : 'agreement_user',
      category: record?.category === '-' ? '' : record?.category ?? '',
      title: record?.title ?? '',
      summary: record?.summary ?? '',
      content: record?.content ?? '',
      version: record?.version ?? '',
      effectiveAt: record?.effectiveAt ?? '',
      attachments: record?.attachments?.map((item) => ({ ...item })) ?? [],
      featured: record?.featured ?? false,
      status: record?.status ?? 'published',
    })
    markBaseline()
    formRef.value?.clearValidate?.()
  },
)

function addAttachment() {
  if (form.attachments.length < 10) form.attachments.push({ name: '', url: '' })
}

function removeAttachment(index: number) {
  form.attachments.splice(index, 1)
}

async function submit() {
  if (props.submitting) return
  if (await formRef.value?.validate() !== true) return focusFirstInvalid(formRef.value)
  const common = {
    title: form.title.trim(),
    summary: form.summary.trim(),
    content: form.content.trim(),
    version: form.version.trim(),
    effectiveAt: form.effectiveAt || null,
    status: form.status,
  }
  if (props.mode === 'agreement') {
    emit('save', { ...common, kind: form.kind })
    return
  }
  emit('save', {
    ...common,
    category: form.category.trim(),
    attachments: form.attachments.map((item) => ({ name: item.name.trim(), url: item.url.trim() })),
    featured: form.featured,
  })
}
</script>

<template>
  <t-dialog
    lazy
    destroy-on-close
    :visible="visible"
    :header="record ? `编辑${mode === 'community' ? '社区政策' : '协议'}版本` : `新增${mode === 'community' ? '社区政策' : '协议'}版本`"
    width="880px"
    :close-on-overlay-click="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="submit">保存版本</t-button>
      </div>
    </template>
    <t-alert theme="info" class="editor-note">
      {{ mode === 'community' ? '社区政策将展示在移动端社区服务中；置顶政策优先展示。' : '已发布协议供注册与隐私设置读取，请确认版本号和生效日期后再保存。' }}
    </t-alert>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <div class="form-grid">
        <t-form-item v-if="mode === 'agreement'" label="协议类型" name="kind">
          <t-select v-accessible-field v-model="form.kind" :options="[{ label: '用户协议', value: 'agreement_user' }, { label: '隐私政策', value: 'agreement_privacy' }]" />
        </t-form-item>
        <t-form-item v-else label="政策分类" name="category">
          <t-input v-accessible-field clearable v-model="form.category" maxlength="32" placeholder="如：人才政策、入驻指南…" />
        </t-form-item>
        <t-form-item label="版本号" name="version">
          <t-input v-accessible-field clearable v-model="form.version" maxlength="32" placeholder="如：2.1…" />
        </t-form-item>
        <t-form-item label="生效日期" name="effectiveAt">
          <t-date-picker v-accessible-field v-model="form.effectiveAt" value-type="YYYY-MM-DD" clearable />
        </t-form-item>
        <t-form-item label="发布状态" name="status">
          <t-radio-group v-model="form.status"><t-radio value="published">已发布</t-radio><t-radio value="archived">已归档</t-radio></t-radio-group>
        </t-form-item>
      </div>
      <t-form-item label="标题" name="title">
        <t-input v-accessible-field clearable v-model="form.title" maxlength="128" placeholder="请输入清晰、可识别的标题…" />
      </t-form-item>
      <t-form-item label="摘要" name="summary">
        <t-textarea v-accessible-field v-model="form.summary" :maxlength="255" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="用于列表页快速说明适用范围和主要内容…" />
      </t-form-item>
      <t-form-item label="正文" name="content">
        <RichEditor v-accessible-field v-model="form.content" :min-height="320" />
      </t-form-item>

      <template v-if="mode === 'community'">
        <div class="section-heading">
          <div><strong>附件</strong><span>最多 10 个，支持站内相对地址或 HTTPS 地址</span></div>
          <t-button variant="outline" size="small" :disabled="form.attachments.length >= 10" @click="addAttachment"><template #icon><AddIcon /></template>添加附件</t-button>
        </div>
        <div v-if="form.attachments.length" class="attachment-list">
          <div v-for="(attachment, index) in form.attachments" :key="index" class="attachment-row">
            <t-input v-accessible-field="`附件 ${index + 1} 名称`" clearable v-model="attachment.name" maxlength="128" :aria-label="`附件 ${index + 1} 名称`" placeholder="附件名称…" />
            <t-input v-accessible-field="`附件 ${index + 1} 地址`" clearable v-model="attachment.url" maxlength="1000" :aria-label="`附件 ${index + 1} 地址`" placeholder="/api/public/files/... 或 https://...…" />
            <t-button variant="text" theme="danger" shape="square" :aria-label="`删除附件 ${index + 1}`" @click="removeAttachment(index)"><DeleteIcon /></t-button>
          </div>
        </div>
        <t-form-item label="展示优先级" name="featured" class="featured-field">
          <t-switch v-accessible-field v-model="form.featured" /><span class="field-help">设为置顶后将在社区政策列表优先展示</span>
        </t-form-item>
      </template>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.editor-note { margin-bottom: 20px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 8px 0 12px; }
.section-heading div { display: flex; align-items: baseline; gap: 8px; }
.section-heading span, .field-help { color: var(--td-text-color-secondary); font-size: 12px; }
.attachment-list { display: grid; gap: 8px; margin-bottom: 16px; }
.attachment-row { display: grid; grid-template-columns: minmax(140px, 0.7fr) minmax(240px, 1.3fr) 32px; gap: 8px; align-items: center; }
/* 依赖 TDesign form 内部结构类 .t-form__controls-content：让控件与说明横向排列，无对应 API */
.featured-field :deep(.t-form__controls-content) { display: flex; align-items: center; gap: 12px; }
@media (max-width: 720px) {
  .form-grid, .attachment-row { grid-template-columns: 1fr; }
  .section-heading { align-items: flex-start; }
}
</style>
