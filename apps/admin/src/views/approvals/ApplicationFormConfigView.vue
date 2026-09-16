<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import {
  fetchApplicationFormConfigs,
  saveApplicationFormConfig,
  type ApplicationFormConfig,
} from '@/api/applications'

const configs = ref<ApplicationFormConfig[]>([])
const active = ref<ApplicationFormConfig['type']>('settle')
const loading = ref(false)
const saving = ref(false)
const draft = reactive({ title: '', subtitle: '', submitLabel: '', tips: '', fields: '' })
const labels: Record<string, string> = {
  settle: '企业入驻', cooperation: '合作伙伴', individual: '人才登记', identity: '身份绑定',
}
const current = computed(() => configs.value.find((item) => item.type === active.value))

function fill() {
  const item = current.value
  if (!item) return
  draft.title = item.title
  draft.subtitle = item.subtitle
  draft.submitLabel = item.submitLabel
  draft.tips = (item.tips ?? []).join('\n')
  draft.fields = JSON.stringify(item.fields, null, 2)
}

async function load() {
  loading.value = true
  try {
    configs.value = await fetchApplicationFormConfigs()
    fill()
  } finally {
    loading.value = false
  }
}

function select(type: ApplicationFormConfig['type']) {
  active.value = type
  fill()
}

async function save() {
  let fields: Array<Record<string, unknown>>
  try {
    const parsed = JSON.parse(draft.fields) as unknown
    if (!Array.isArray(parsed)) throw new Error()
    fields = parsed as Array<Record<string, unknown>>
  } catch {
    MessagePlugin.error('字段定义必须是有效的 JSON 数组')
    return
  }
  if (!draft.title.trim() || !draft.submitLabel.trim()) {
    MessagePlugin.warning('请填写表单标题和提交按钮文案')
    return
  }
  saving.value = true
  try {
    await saveApplicationFormConfig(active.value, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      submitLabel: draft.submitLabel.trim(),
      tips: draft.tips.split('\n').map((item) => item.trim()).filter(Boolean),
      fields,
    })
    MessagePlugin.success('表单配置已保存，客户端将立即使用新 schema')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-fade-in">
    <PageHeader title="申请表单配置" description="配置客户端企业合作、人才登记与身份绑定表单的字段 schema" />
    <div class="page-card" :class="{ loading }">
      <t-tabs :value="active" @change="(value) => select(value as ApplicationFormConfig['type'])">
        <t-tab-panel v-for="item in configs" :key="item.type" :value="item.type" :label="labels[item.type]" />
      </t-tabs>
      <t-form :data="draft" label-align="top" class="config-form">
        <div class="form-grid">
          <t-form-item label="表单标题"><t-input v-model="draft.title" /></t-form-item>
          <t-form-item label="提交按钮文案"><t-input v-model="draft.submitLabel" /></t-form-item>
        </div>
        <t-form-item label="副标题"><t-input v-model="draft.subtitle" /></t-form-item>
        <t-form-item label="提示语（每行一条）"><t-textarea v-model="draft.tips" :autosize="{ minRows: 2, maxRows: 5 }" /></t-form-item>
        <t-form-item label="字段定义（JSON 数组）">
          <t-textarea v-model="draft.fields" :autosize="{ minRows: 16, maxRows: 28 }" />
        </t-form-item>
        <t-button theme="primary" :loading="saving" @click="save">保存配置</t-button>
      </t-form>
    </div>
  </div>
</template>

<style scoped>
.config-form { margin-top: 16px; max-width: 960px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
</style>
