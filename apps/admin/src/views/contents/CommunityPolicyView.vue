<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import StatusTag from '@/components/StatusTag.vue'
import PolicyEditorDialog from '@/components/PolicyEditorDialog.vue'
import { createCommunityPolicy, fetchCommunityPolicies, updateCommunityPolicy, type AgreementPolicyPayload, type CommunityPolicyPayload, type PolicyRecord } from '@/api/policies'

const loading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const rows = ref<PolicyRecord[]>([])
const dialogVisible = ref(false)
const editing = ref<PolicyRecord | null>(null)

const columns = [
  { colKey: 'id', title: '政策编号', width: 110, ellipsis: true },
  { colKey: 'title', title: '政策标题', minWidth: 230, ellipsis: true },
  { colKey: 'category', title: '分类', cell: 'category', width: 120, ellipsis: true },
  { colKey: 'version', title: '版本', cell: 'version', width: 90, ellipsis: true },
  { colKey: 'featured', title: '展示', cell: 'featured', width: 90 },
  { colKey: 'status', title: '状态', cell: 'status', width: 90 },
  { colKey: 'publisher', title: '发布人', cell: 'publisher', width: 120, ellipsis: true },
  { colKey: 'updatedAt', title: '更新时间', cell: 'updatedAt', width: 170, ellipsis: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 100 },
]

async function load() {
  loading.value = true
  loadError.value = ''
  try { rows.value = await fetchCommunityPolicies() }
  catch (error) { loadError.value = error instanceof Error ? error.message : '社区政策加载失败' }
  finally { loading.value = false }
}

function openEditor(record?: PolicyRecord) {
  editing.value = record ?? null
  dialogVisible.value = true
}

async function save(payload: CommunityPolicyPayload | AgreementPolicyPayload) {
  submitting.value = true
  try {
    const communityPayload = payload as CommunityPolicyPayload
    if (editing.value) await updateCommunityPolicy(editing.value.id, communityPayload)
    else await createCommunityPolicy(communityPayload)
    MessagePlugin.success(editing.value ? '社区政策已更新' : '社区政策已新增')
    dialogVisible.value = false
    await load()
  } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '保存失败') }
  finally { submitting.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page-fade-in">
    <PageHeader title="社区政策" description="维护移动端社区服务展示的政策、办事指引与附件">
      <template #actions><t-button theme="primary" @click="openEditor()">新增政策</t-button></template>
    </PageHeader>
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <div v-else class="page-card">
      <t-table row-key="id" table-layout="fixed" hover resizable :data="rows" :columns="columns" :loading="loading" empty="暂无社区政策">
        <template #category="{ row }">{{ row.category || '—' }}</template>
        <template #version="{ row }">{{ row.version || '—' }}</template>
        <template #featured="{ row }"><t-tag v-if="row.featured" theme="primary" variant="light">置顶</t-tag><span v-else class="muted">常规</span></template>
        <template #status="{ row }"><StatusTag entity="communityPolicy" :value="row.status" /></template>
        <template #publisher="{ row }">{{ row.publisher || '—' }}</template>
        <template #updatedAt="{ row }">{{ row.updatedAt || '—' }}</template>
        <template #op="{ row }"><t-button variant="text" size="small" @click="openEditor(row)">编辑</t-button></template>
      </t-table>
    </div>
    <PolicyEditorDialog v-model:visible="dialogVisible" mode="community" :record="editing" :submitting="submitting" @save="save" />
  </div>
</template>

<style scoped>
.muted { color: var(--td-text-color-placeholder); font-size: 12px; }
</style>
