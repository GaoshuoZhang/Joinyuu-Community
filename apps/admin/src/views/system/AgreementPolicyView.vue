<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import PolicyEditorDialog from '@/components/PolicyEditorDialog.vue'
import StatusTag from '@/components/StatusTag.vue'
import { createAgreementPolicy, fetchAgreementPolicies, updateAgreementPolicy, type AgreementPolicyPayload, type CommunityPolicyPayload, type PolicyRecord } from '@/api/policies'

const loading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const rows = ref<PolicyRecord[]>([])
const dialogVisible = ref(false)
const editing = ref<PolicyRecord | null>(null)
const kindText = { agreement_user: '用户协议', agreement_privacy: '隐私政策' } as const
function policyKindText(kind: string) { return kindText[kind as keyof typeof kindText] ?? kind }

const columns = [
  { colKey: 'id', title: '协议编号', width: 110, ellipsis: true },
  { colKey: 'title', title: '协议标题', minWidth: 260, ellipsis: true },
  { colKey: 'kind', title: '协议类型', cell: 'kind', width: 110 },
  { colKey: 'version', title: '版本', width: 90, ellipsis: true },
  { colKey: 'effectiveAt', title: '生效日期', width: 170, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 90 },
  { colKey: 'publisher', title: '发布人', width: 120, ellipsis: true },
  { colKey: 'updatedAt', title: '更新时间', width: 170, ellipsis: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 80 },
]

async function load() {
  loading.value = true
  loadError.value = ''
  try { rows.value = await fetchAgreementPolicies() }
  catch (error) { loadError.value = error instanceof Error ? error.message : '协议加载失败' }
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
    const agreementPayload = payload as AgreementPolicyPayload
    if (editing.value) await updateAgreementPolicy(editing.value.id, agreementPayload)
    else await createAgreementPolicy(agreementPayload)
    MessagePlugin.success(editing.value ? '协议已更新' : '协议已新增')
    dialogVisible.value = false
    await load()
  } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '保存失败') }
  finally { submitting.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page-fade-in">
    <PageHeader title="协议管理" description="独立维护用户协议与隐私政策版本，供注册及隐私设置场景读取">
      <template #actions><t-button theme="primary" @click="openEditor()">新增协议</t-button></template>
    </PageHeader>
    <!-- 错误态与表格互斥：否则加载失败时表格空态「暂无协议版本」仍渲染，误导为无数据 -->
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <div v-else class="page-card">
      <t-table row-key="id" table-layout="fixed" hover resizable :data="pageData" :columns="columns" :loading="loading" :pagination="pagination" @page-change="onPageChange">
        <template #empty>
          <ListEmptyState description="暂无协议版本">
            <template #action>
              <t-button theme="primary" @click="openEditor()">新增协议</t-button>
            </template>
          </ListEmptyState>
        </template>
        <template #kind="{ row }"><t-tag variant="light">{{ policyKindText(row.kind) }}</t-tag></template>
        <template #status="{ row }"><StatusTag entity="communityPolicy" :value="row.status" /></template>
        <template #op="{ row }"><t-button variant="text" size="small" theme="primary" @click="openEditor(row)">编辑</t-button></template>
      </t-table>
    </div>
    <PolicyEditorDialog v-model:visible="dialogVisible" mode="agreement" :record="editing" :submitting="submitting" @save="save" />
  </div>
</template>
