<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ColumnController from '@/components/ColumnController.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import CardSegmentsEditor from '@/components/CardSegmentsEditor.vue'
import { useListQueryState } from '@/utils/listQuery'
import { useDialogDirtyGuard } from '@/utils/form'
import { cardFields, fetchCards, fetchCardSchema, saveCardSchema, updateCard, type CardRow, type CardType } from '@/api/cards'

const type = ref<CardType>('individual')
const keyword = ref('')
const page = ref(1)
const rows = ref<CardRow[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const submitting = ref(false)
const visible = ref(false)
const schemaVisible = ref(false)
const editableFields = ref<string[]>([])
const selectedId = ref('')
const form = reactive<Record<string, string>>({})
const segments = reactive<Record<string, Record<string, string>[]>>({ education: [], work: [], projects: [], honors: [], socials: [], customLinks: [] })
const visibility = reactive({ age: true, politicalStatus: true })
/* 未保存保护：基线覆盖文本字段 + 分段条目 + 隐私开关（嵌套 reactive 一并序列化） */
const { markBaseline, guardClose } = useDialogDirtyGuard(reactive({ form, segments, visibility }))
const segmentFields: Record<string, { key: string; label: string }[]> = Object.fromEntries(Object.entries({
  education: { school: '学校', major: '专业', degree: '学位', period: '起止时间' },
  work: { company: '公司', title: '职位', period: '起止时间', description: '工作内容' },
  projects: { name: '项目名称', role: '角色', period: '起止时间', description: '项目简介' },
  honors: { name: '荣誉名称', date: '获得时间' }, socials: { label: '名称', url: '链接' }, customLinks: { label: '名称', url: '链接' },
}).map(([key, fields]) => [key, Object.entries(fields).map(([k, label]) => ({ key: k, label }))]))
const textFields = computed(() => cardFields[type.value].filter(f => !segmentFields[f.key] && f.key !== 'visibility'))
const allColumns = [
  { colKey: 'name', title: '名片', width: 220 }, { colKey: 'intro', title: '简介', width: 360, ellipsis: true },
  { colKey: 'op', title: '操作', width: 120 },
]
const visibleKeys = ref(allColumns.map(c => c.colKey))
const columns = computed(() => visibleKeys.value.map(k => allColumns.find(c => c.colKey === k)).filter(Boolean))
const { syncQuery } = useListQueryState({}, load, { refs: { type, keyword, page } })
let version = 0
async function load() {
  const current = ++version
  syncQuery(); loading.value = true; loadError.value = ''
  try {
    const result = await fetchCards(type.value, page.value, keyword.value)
    if (current === version) { rows.value = result.list; total.value = result.total }
  } catch (e) { if (current === version) loadError.value = e instanceof Error ? e.message : '加载失败' }
  finally { if (current === version) loading.value = false }
}
function onSearch() {
  page.value = 1
  load()
}
function onReset() {
  keyword.value = ''
  page.value = 1
  load()
}
function open(row: CardRow) {
  selectedId.value = row.userId ?? row.id ?? ''
  for (const field of textFields.value) {
    const value = row[field.key as keyof CardRow]
    form[field.key] = Array.isArray(value) ? value.join('、') : String(value ?? '')
  }
  for (const key of Object.keys(segmentFields)) segments[key] = JSON.parse(JSON.stringify(row[key as keyof CardRow] ?? []))
  Object.assign(visibility, row.visibility ?? { age: true, politicalStatus: true })
  markBaseline()
  visible.value = true
}
async function openSchema() {
  try { editableFields.value = (await fetchCardSchema(type.value)).editableFields; schemaVisible.value = true }
  catch (e) { MessagePlugin.error(e instanceof Error ? e.message : '加载字段配置失败') }
}
async function submitSchema() {
  if (submitting.value) return
  submitting.value = true
  try { await saveCardSchema(type.value, editableFields.value); schemaVisible.value = false; MessagePlugin.success('字段配置已保存') }
  catch (e) { MessagePlugin.error(e instanceof Error ? e.message : '保存失败') }
  finally { submitting.value = false }
}
async function submit() {
  if (submitting.value) return
  const payload: Record<string, unknown> = Object.fromEntries(textFields.value.map(f => [f.key, form[f.key]?.trim() ?? '']))
  if (type.value === 'individual') Object.assign(payload, JSON.parse(JSON.stringify(segments)), { visibility: { ...visibility }, skills: (form.skills ?? '').split(/[、,，]/).map(v => v.trim()).filter(Boolean) })
  submitting.value = true
  try { await updateCard(type.value, selectedId.value, payload); visible.value = false; MessagePlugin.success('名片已更新'); await load() }
  catch (e) { MessagePlugin.error(e instanceof Error ? e.message : '保存失败') }
  finally { submitting.value = false }
}
/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
function onCardClose() {
  guardClose(() => { visible.value = false })
}
/* 空态判断只看关键词（type 为页签切换而非筛选条件） */
const emptyQuery = computed(() => ({ keyword: keyword.value }))
onMounted(load)
</script>

<template>
  <div class="page-fade-in">
    <PageHeader title="名片管理" description="维护公开名片与用户可编辑字段，保存后即时生效" />
    <div class="page-filter-bar">
      <t-input v-model="keyword" class="ctl-w-xl" clearable placeholder="搜索姓名、企业名或编号…" @enter="onSearch" @clear="onSearch" />
      <t-button @click="onSearch">查询</t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
      <t-button @click="openSchema">配置用户可编辑字段</t-button>
      <ColumnController v-model="visibleKeys" storage-key="card-management" :columns="allColumns.map(c => ({ key: c.colKey, title: c.title }))" />
    </div>
    <div class="page-card">
      <t-tabs v-model="type" @change="page = 1; load()"><t-tab-panel value="individual" label="个人名片" /><t-tab-panel value="enterprise" label="企业名片" /></t-tabs>
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
      <t-table :row-key="type === 'individual' ? 'userId' : 'id'" :data="rows" :columns="columns" :loading="loading" table-layout="fixed" hover resizable :pagination="{ current: page, pageSize: 20, total, showPageSize: false }" @page-change="(p: { current: number }) => { page = p.current; load() }">
        <template #name="{ row }">{{ row.displayName ?? row.name }}<t-tag class="id-tag-block" size="small" variant="light">{{ row.userId ?? row.id }}</t-tag></template>
        <template #intro="{ row }">{{ (row.intro ?? row.description) || '—' }}</template>
        <template #op="{ row }"><t-button variant="text" theme="primary" @click="open(row)">查看/编辑</t-button></template>
        <template #empty>
          <ListEmptyState :query="emptyQuery" description="暂无名片" @clear="onReset" />
        </template>
      </t-table>
    </div>
    <t-dialog v-model:visible="schemaVisible" header="用户可编辑字段" width="560px" :confirm-btn="{ content: '保存配置', loading: submitting }" @confirm="submitSchema">
      <p>未勾选字段将从客户端编辑表单隐藏；已有内容继续保留，后台仍可维护。</p>
      <t-checkbox-group v-model="editableFields"><t-checkbox v-for="field in cardFields[type]" :key="field.key" :value="field.key" :label="field.label" /></t-checkbox-group>
    </t-dialog>
    <!-- 关闭走 guardClose：有未保存修改时先确认（不用 v-model:visible，避免直接置 false 绕过守卫） -->
    <t-dialog :visible="visible" header="编辑名片" width="720px" :confirm-btn="{ content: '保存名片', loading: submitting }" @confirm="submit" @close="onCardClose">
      <t-form :data="form" label-align="top">
        <t-form-item v-for="field in textFields" :key="field.key" :label="field.label" :name="field.key"><t-textarea v-if="['intro', 'description', 'industryExperience', 'services', 'advantages'].includes(field.key)" v-model="form[field.key]" :name="field.key" :placeholder="`${field.label}…`" :maxlength="500" /><t-input v-else v-model="form[field.key]" :name="field.key" :placeholder="`${field.label}…`" :maxlength="255" /></t-form-item>
      </t-form>
      <template v-if="type === 'individual'">
        <div class="privacy"><t-checkbox v-model="visibility.age">公开年龄</t-checkbox><t-checkbox v-model="visibility.politicalStatus">公开政治面貌</t-checkbox></div>
        <section v-for="(fields, key) in segmentFields" :key="key" class="section"><h3>{{ cardFields.individual.find(f => f.key === key)?.label }}</h3><CardSegmentsEditor v-model="segments[key]" :fields="fields" /></section>
      </template>
    </t-dialog>
  </div>
</template>
<style scoped>
.privacy { display: flex; gap: var(--td-comp-margin-m); }
.section { margin-top: var(--td-comp-margin-l); }
.section h3 { font: var(--td-font-title-medium); margin-bottom: var(--td-comp-margin-s); }
</style>
