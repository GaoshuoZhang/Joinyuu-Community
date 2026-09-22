<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
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
  { colKey: 'effectiveAt', title: '生效日期', width: 160, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 90 },
  { colKey: 'publisher', title: '发布人', width: 120, ellipsis: true },
  { colKey: 'updatedAt', title: '更新时间', width: 160, ellipsis: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 80 },
]

async function load() {
  loading.value = true
  loadError.value = ''
  try { rows.value = await fetchAgreementPolicies() }
  catch (error) { loadError.value = error instanceof Error ? error.message : '协议加载失败' }
  finally { loading.value = false }
}

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
    <div class="page-card">
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
      <t-table row-key="id" table-layout="fixed" hover resizable :data="rows" :columns="columns" :loading="loading" empty="暂无协议版本">
        <template #kind="{ row }"><t-tag variant="light">{{ policyKindText(row.kind) }}</t-tag></template>
        <template #status="{ row }"><StatusTag entity="communityPolicy" :value="row.status" /></template>
        <template #op="{ row }"><t-button variant="text" size="small" theme="primary" @click="openEditor(row)">编辑</t-button></template>
      </t-table>
    </div>
    <PolicyEditorDialog v-model:visible="dialogVisible" mode="agreement" :record="editing" :submitting="submitting" @save="save" />
  </div>
</template>
