<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import {
  fetchApplicationFormConfigs,
  saveApplicationFormConfig,
  type ApplicationFormConfig,
  type ApplicationFormField,
  type ApplicationFieldType,
} from '@/api/applications'

const configs = ref<ApplicationFormConfig[]>([])
const active = ref<ApplicationFormConfig['type']>('settle')
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const advancedMode = ref(false)
const advancedJson = ref('')
const draft = reactive({
  title: '',
  subtitle: '',
  submitLabel: '',
  tips: '',
  fields: [] as ApplicationFormField[],
})

const labels: Record<ApplicationFormConfig['type'], string> = {
  settle: '企业入驻', cooperation: '合作伙伴', individual: '人才登记',
}
const typeOptions: { label: string; value: ApplicationFieldType }[] = [
  { label: '单行文本', value: 'text' },
  { label: '多行文本', value: 'textarea' },
  { label: '选择器', value: 'select' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '文件上传', value: 'upload' },
]
const current = computed(() => configs.value.find((item) => item.type === active.value))

function cloneFields(fields: ApplicationFormField[]): ApplicationFormField[] {
  return JSON.parse(JSON.stringify(fields)) as ApplicationFormField[]
}

function fill() {
  const item = current.value
  if (!item) return
  draft.title = item.title
  draft.subtitle = item.subtitle
  draft.submitLabel = item.submitLabel
  draft.tips = (item.tips ?? []).join('\n')
  draft.fields = cloneFields(item.fields)
  advancedJson.value = JSON.stringify(item.fields, null, 2)
  advancedMode.value = false
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    configs.value = await fetchApplicationFormConfigs()
    fill()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
  }
}

function select(type: ApplicationFormConfig['type']) {
  active.value = type
  fill()
}

function addField() {
  const used = new Set(draft.fields.map((field) => field.key))
  let number = draft.fields.length + 1
  while (used.has(`field${number}`)) number += 1
  draft.fields.push({ key: `field${number}`, label: '新增字段', type: 'text', required: false })
}

function removeField(index: number) {
  draft.fields.splice(index, 1)
}

function moveField(index: number, offset: -1 | 1) {
  const next = index + offset
  if (next < 0 || next >= draft.fields.length) return
  const [field] = draft.fields.splice(index, 1)
  draft.fields.splice(next, 0, field)
}

function changeType(field: ApplicationFormField) {
  if (field.type === 'select') {
    if (!field.options?.length) field.options = [{ label: '选项 1', value: 'option1' }]
  } else {
    delete field.options
  }
  if (field.type !== 'text' && field.type !== 'textarea') delete field.maxlength
  if (field.type === 'upload') {
    field.multiple ??= false
    field.maxCount ??= 1
  } else {
    delete field.accept
    delete field.multiple
    delete field.maxCount
  }
}

function addOption(field: ApplicationFormField) {
  const options = (field.options ??= [])
  const number = options.length + 1
  options.push({ label: `选项 ${number}`, value: `option${number}` })
}

function removeOption(field: ApplicationFormField, index: number) {
  field.options?.splice(index, 1)
}

function requestAdvancedMode(value: boolean) {
  if (!value) {
    advancedMode.value = false
    return
  }
  const dialog = DialogPlugin.confirm({
    header: '启用高级 JSON 编辑',
    body: '高级模式可能破坏客户端表单。保存前仍会执行完整校验；建议仅用于维护可视化编辑器尚未支持的扩展属性。',
    confirmBtn: '了解风险，继续',
    cancelBtn: '取消',
    onConfirm: () => {
      advancedJson.value = JSON.stringify(draft.fields, null, 2)
      advancedMode.value = true
      dialog.destroy()
    },
    onCancel: () => dialog.destroy(),
    onClose: () => dialog.destroy(),
  })
}

function validateFields(fields: ApplicationFormField[]): string | null {
  if (!fields.length) return '至少需要配置一个字段'
  if (fields.length > 50) return '字段数量不能超过 50 个'
  const keys = new Set<string>()
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const name = `第 ${index + 1} 个字段`
    if (!field || typeof field !== 'object' || Array.isArray(field)) return `${name}必须是对象`
    if (typeof field.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.key) || field.key.length > 64) return `${name}的 key 须以字母开头，且只能包含字母、数字和下划线`
    if (keys.has(field.key)) return `${name}的 key「${field.key}」重复`
    keys.add(field.key)
    if (typeof field.label !== 'string' || !field.label.trim() || field.label.length > 100) return `${name}需填写不超过 100 字的标题`
    if (!typeOptions.some((option) => option.value === field.type)) return `${name}使用了不支持的字段类型`
    if (field.required !== undefined && typeof field.required !== 'boolean') return `${name}的 required 必须是布尔值`
    if (field.placeholder !== undefined && (typeof field.placeholder !== 'string' || field.placeholder.length > 200)) return `${name}的占位提示不能超过 200 字`
    if (field.help !== undefined && (typeof field.help !== 'string' || field.help.length > 500)) return `${name}的帮助说明不能超过 500 字`
    if (field.maxlength !== undefined && (!Number.isInteger(field.maxlength) || field.maxlength < 1 || field.maxlength > 10000)) return `${name}的最大长度须为 1 至 10000 的整数`
    if (field.type !== 'text' && field.type !== 'textarea' && field.maxlength !== undefined) return `${name}的类型不支持最大长度`
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || !field.options.length) return `${name}至少需要一个选项`
      const values = new Set<string>()
      for (const option of field.options) {
        if (!option || typeof option.label !== 'string' || !option.label.trim() || typeof option.value !== 'string' || !option.value.trim()) return `${name}存在空的选项名称或值`
        if (option.label.length > 100 || option.value.length > 100) return `${name}的选项名称和值不能超过 100 字`
        if (values.has(option.value)) return `${name}存在重复选项值「${option.value}」`
        values.add(option.value)
      }
    } else if (field.options !== undefined) return `${name}仅选择器类型可以配置选项`
    if (field.type === 'upload') {
      if (field.accept !== undefined && (typeof field.accept !== 'string' || field.accept.length > 255)) return `${name}的文件类型限制无效`
      if (field.accept && !field.accept.split(',').every((item) => /^(?:[\w.+-]+\/(?:\*|[\w.+-]+)|\.[\w]+)$/.test(item.trim()))) return `${name}的文件类型须使用 MIME 类型或扩展名并以逗号分隔`
      if (field.multiple !== undefined && typeof field.multiple !== 'boolean') return `${name}的多文件开关必须是布尔值`
      if (field.maxCount !== undefined && (!Number.isInteger(field.maxCount) || field.maxCount < 1 || field.maxCount > 20)) return `${name}的最大文件数须为 1 至 20 的整数`
      if (field.multiple !== true && (field.maxCount ?? 1) !== 1) return `${name}未开启多文件时，最大文件数只能为 1`
    } else if (field.accept !== undefined || field.multiple !== undefined || field.maxCount !== undefined) return `${name}仅上传类型可以配置上传属性`
  }
  return null
}

function fieldsForSave(): ApplicationFormField[] | null {
  if (!advancedMode.value) return cloneFields(draft.fields)
  try {
    const parsed = JSON.parse(advancedJson.value) as unknown
    if (!Array.isArray(parsed)) throw new Error()
    return parsed as ApplicationFormField[]
  } catch {
    MessagePlugin.error('高级字段定义必须是有效的 JSON 数组')
    return null
  }
}

async function save() {
  const fields = fieldsForSave()
  if (!fields) return
  if (!draft.title.trim() || !draft.submitLabel.trim()) {
    MessagePlugin.warning('请填写表单标题和提交按钮文案')
    return
  }
  if (draft.title.trim().length > 100 || draft.subtitle.trim().length > 200 || draft.submitLabel.trim().length > 50) {
    MessagePlugin.warning('标题、副标题或按钮文案超过长度限制')
    return
  }
  const fieldError = validateFields(fields)
  if (fieldError) {
    MessagePlugin.error(fieldError)
    return
  }
  const tips = draft.tips.split('\n').map((item) => item.trim()).filter(Boolean)
  if (tips.length > 20 || tips.some((tip) => tip.length > 500)) {
    MessagePlugin.error('提示语最多 20 条，每条不超过 500 字')
    return
  }
  saving.value = true
  try {
    await saveApplicationFormConfig(active.value, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      submitLabel: draft.submitLabel.trim(),
      tips,
      fields,
    })
    MessagePlugin.success('表单配置已保存，客户端将立即使用新 schema')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-fade-in">
    <PageHeader title="申请表单配置" description="使用可视化字段编辑器配置客户端申请表单；保存后立即生效" />
    <div class="page-card" :class="{ loading }">
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
      <template v-else>
        <t-tabs :value="active" @change="(value) => select(value as ApplicationFormConfig['type'])">
          <t-tab-panel v-for="item in configs" :key="item.type" :value="item.type" :label="labels[item.type]" />
        </t-tabs>

        <t-form :data="draft" label-align="top" class="config-form" @submit="save">
          <div class="form-grid">
            <t-form-item label="表单标题" name="title" required><t-input v-model="draft.title" :maxlength="100" /></t-form-item>
            <t-form-item label="提交按钮文案" name="submitLabel" required><t-input v-model="draft.submitLabel" :maxlength="50" /></t-form-item>
          </div>
          <t-form-item label="副标题" name="subtitle"><t-input v-model="draft.subtitle" :maxlength="200" /></t-form-item>
          <t-form-item label="提示语（每行一条）" name="tips"><t-textarea v-model="draft.tips" :autosize="{ minRows: 2, maxRows: 5 }" /></t-form-item>

          <section class="fields-section" aria-labelledby="fields-heading">
            <div class="section-head">
              <div>
                <h2 id="fields-heading">表单字段</h2>
                <p>字段 key 保存后应保持稳定，以便修改重提时正确回填。</p>
              </div>
              <t-button v-if="!advancedMode" variant="outline" type="button" @click="addField">新增字段</t-button>
            </div>

            <div v-if="!advancedMode" class="field-list">
              <article v-for="(field, index) in draft.fields" :key="index" class="field-card" :aria-labelledby="`field-${index}-title`">
                <div class="field-card-head">
                  <h3 :id="`field-${index}-title`">{{ index + 1 }}. {{ field.label || '未命名字段' }}</h3>
                  <div class="field-actions" :aria-label="`${field.label || `第 ${index + 1} 个`}字段操作`">
                    <t-button variant="text" type="button" :disabled="index === 0" @click="moveField(index, -1)">上移</t-button>
                    <t-button variant="text" type="button" :disabled="index === draft.fields.length - 1" @click="moveField(index, 1)">下移</t-button>
                    <t-popconfirm content="确认删除该字段？" @confirm="removeField(index)">
                      <t-button variant="text" theme="danger" type="button">删除</t-button>
                    </t-popconfirm>
                  </div>
                </div>

                <div class="field-grid">
                  <t-form-item label="字段标题" required><t-input v-model="field.label" :maxlength="100" /></t-form-item>
                  <t-form-item label="字段 key" required help="字母开头，仅字母、数字和下划线"><t-input v-model="field.key" :maxlength="64" /></t-form-item>
                  <t-form-item label="字段类型" required>
                    <t-select v-model="field.type" :options="typeOptions" @change="changeType(field)" />
                  </t-form-item>
                  <t-form-item label="必填"><t-switch v-model="field.required" /></t-form-item>
                </div>
                <div class="field-grid">
                  <t-form-item label="占位提示"><t-input v-model="field.placeholder" :maxlength="200" placeholder="可不填…" /></t-form-item>
                  <t-form-item label="帮助说明"><t-input v-model="field.help" :maxlength="500" placeholder="可不填，显示在字段下方…" /></t-form-item>
                  <t-form-item v-if="field.type === 'text' || field.type === 'textarea'" label="最大长度">
                    <t-input-number v-model="field.maxlength" :min="1" :max="10000" :decimal-places="0" placeholder="可不填…" />
                  </t-form-item>
                </div>

                <div v-if="field.type === 'select'" class="sub-editor">
                  <div class="sub-editor-head"><h4>选择项</h4><t-button variant="text" type="button" @click="addOption(field)">添加选项</t-button></div>
                  <div v-for="(option, optionIndex) in field.options" :key="optionIndex" class="option-row">
                    <t-input v-model="option.label" :aria-label="`选项 ${optionIndex + 1} 名称`" placeholder="显示名称…" :maxlength="100" />
                    <t-input v-model="option.value" :aria-label="`选项 ${optionIndex + 1} 值`" placeholder="提交值…" :maxlength="100" />
                    <t-button variant="text" theme="danger" type="button" :aria-label="`删除选项 ${optionIndex + 1}`" @click="removeOption(field, optionIndex)">删除</t-button>
                  </div>
                </div>

                <div v-if="field.type === 'upload'" class="field-grid upload-settings">
                  <t-form-item label="允许的文件类型" help="MIME 类型或扩展名，逗号分隔"><t-input v-model="field.accept" :maxlength="255" placeholder="如 image/*,application/pdf…" /></t-form-item>
                  <t-form-item label="允许多文件"><t-switch v-model="field.multiple" @change="field.maxCount = field.multiple ? Math.max(field.maxCount ?? 1, 1) : 1" /></t-form-item>
                  <t-form-item label="最大文件数"><t-input-number v-model="field.maxCount" :min="1" :max="20" :decimal-places="0" :disabled="!field.multiple" /></t-form-item>
                </div>
              </article>
              <div v-if="!draft.fields.length" class="empty-fields" role="status">尚未配置字段，请新增至少一个字段。</div>
            </div>

            <div class="advanced-panel">
              <div class="advanced-toggle">
                <div><strong>高级 JSON 编辑</strong><p>仅用于维护可视化编辑器未支持的扩展属性。</p></div>
                <t-switch :value="advancedMode" aria-label="高级 JSON 编辑" @change="requestAdvancedMode" />
              </div>
              <template v-if="advancedMode">
                <t-alert theme="warning" title="高级模式已启用">直接编辑完整字段数组。格式或属性组合不合法时无法保存。</t-alert>
                <label class="raw-label" for="application-fields-json">字段定义 JSON</label>
                <t-textarea id="application-fields-json" v-model="advancedJson" :autosize="{ minRows: 16, maxRows: 30 }" spellcheck="false" />
              </template>
            </div>
          </section>

          <div class="save-bar"><t-button theme="primary" type="submit" :loading="saving">保存配置</t-button></div>
        </t-form>
      </template>
    </div>
  </div>
</template>

<style scoped>
.config-form { margin-top: 16px; max-width: 1120px; }
.form-grid, .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.field-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.fields-section { margin-top: 8px; }
.section-head, .field-card-head, .sub-editor-head, .advanced-toggle, .save-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.section-head { margin-bottom: 16px; }
.section-head h2, .field-card-head h3, .sub-editor-head h4 { margin: 0; color: var(--td-text-color-primary); }
.section-head h2 { font-size: 18px; }
.field-card-head h3 { font-size: 15px; }
.sub-editor-head h4 { font-size: 14px; }
.section-head p, .advanced-toggle p { margin: 4px 0 0; color: var(--td-text-color-secondary); font-size: 13px; }
.field-list { display: grid; gap: 12px; }
.field-card { padding: 16px; border: 1px solid var(--td-component-border); border-radius: var(--td-radius-medium); background: var(--td-bg-color-container); }
.field-card-head { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--td-component-stroke); }
.field-actions { display: flex; align-items: center; }
.sub-editor { margin-top: 4px; padding: 12px; border-radius: var(--td-radius-default); background: var(--td-bg-color-secondarycontainer); }
.sub-editor-head { margin-bottom: 8px; }
.option-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-top: 8px; }
.upload-settings { padding-top: 4px; border-top: 1px dashed var(--td-component-border); }
.empty-fields { padding: 32px; text-align: center; color: var(--td-text-color-secondary); border: 1px dashed var(--td-component-border); }
.advanced-panel { margin-top: 20px; padding: 16px; border: 1px solid var(--td-component-border); border-radius: var(--td-radius-medium); }
.raw-label { display: block; margin: 16px 0 8px; font-weight: 500; color: var(--td-text-color-primary); }
.save-bar { justify-content: flex-end; position: sticky; bottom: 0; z-index: 2; margin-top: 16px; padding: 12px 0; background: var(--td-bg-color-container); }
@media (max-width: 900px) {
  .form-grid, .field-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 640px) {
  .form-grid, .field-grid, .option-row { grid-template-columns: 1fr; }
  .section-head, .field-card-head, .advanced-toggle { align-items: flex-start; flex-direction: column; }
}
</style>
