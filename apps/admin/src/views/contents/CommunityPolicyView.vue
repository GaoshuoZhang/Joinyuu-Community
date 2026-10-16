<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
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

/* 客户端分页：全量数据切片展示 */
const currentPage = ref(1)
const pageSize = ref(10)
const pageData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: rows.value.length,
  showJumper: true,
}))

function onPageChange(p: { current: number; pageSize: number }) {
  currentPage.value = p.current
  pageSize.value = p.pageSize
}

/* 数据变少导致当前页越界时夹到合法页码 */
watch(rows, () => {
  const maxPage = Math.max(1, Math.ceil(rows.value.length / pageSize.value))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

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
      <t-table row-key="id" table-layout="fixed" hover resizable :data="pageData" :columns="columns" :loading="loading" :pagination="pagination" @page-change="onPageChange">
        <template #empty>
          <ListEmptyState description="暂无社区政策">
            <template #action>
              <t-button theme="primary" @click="openEditor()">新增政策</t-button>
            </template>
          </ListEmptyState>
        </template>
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
