<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DialogPlugin, MessagePlugin, type FormProps } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import RichEditor from '@/components/RichEditor.vue'
import {
  createCommunityPolicy,
  fetchCommunityPolicies,
  fetchGovernanceAppeals,
  fetchGovernanceReports,
  reviewGovernanceAppeal,
  reviewGovernanceReport,
  updateCommunityPolicy,
  type CommunityPolicy,
  type GovernanceAppeal,
  type GovernanceReport,
  type PolicyPayload,
} from '@/api/governance'

type Tab = 'reports' | 'appeals' | 'policies'
const activeTab = ref<Tab>('reports')
const loading = ref(false)
const submitting = ref(false)
const reports = ref<GovernanceReport[]>([])
const appeals = ref<GovernanceAppeal[]>([])
const policies = ref<CommunityPolicy[]>([])
const reportStatus = ref('pending')
const reportTargetType = ref('')
const appealStatus = ref('pending')
const reportTotal = ref(0)
const appealTotal = ref(0)
const query = reactive({ page: 1, pageSize: 20 })

const reportColumns = [
  { colKey: 'id', title: '举报编号', width: 110, ellipsis: true },
  { colKey: 'target', title: '举报对象', cell: 'target', minWidth: 210, ellipsis: true },
  { colKey: 'reason', title: '举报原因', minWidth: 150, ellipsis: true },
  { colKey: 'reporterId', title: '举报人', width: 105, ellipsis: true },
  { colKey: 'at', title: '提交时间', width: 160, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100 },
  { colKey: 'op', title: '操作', cell: 'op', width: 100 },
]
const appealColumns = [
  { colKey: 'id', title: '申诉编号', width: 90 },
  { colKey: 'target', title: '申诉对象', cell: 'target', minWidth: 180, ellipsis: true },
  { colKey: 'reason', title: '申诉理由', minWidth: 220, ellipsis: true },
  { colKey: 'appellantId', title: '申诉人', width: 105, ellipsis: true },
  { colKey: 'createdAt', title: '提交时间', width: 160, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100 },
  { colKey: 'op', title: '操作', cell: 'op', width: 100 },
]
const policyColumns = [
  { colKey: 'id', title: '政策编号', width: 100, ellipsis: true },
  { colKey: 'title', title: '标题', minWidth: 180, ellipsis: true },
  { colKey: 'kind', title: '类型', cell: 'kind', width: 110 },
  { colKey: 'version', title: '版本', width: 90, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'policyStatus', width: 90 },
  { colKey: 'updatedAt', title: '更新时间', width: 160, ellipsis: true },
  { colKey: 'op', title: '操作', cell: 'policyOp', width: 90 },
]

const reportDialogVisible = ref(false)
const appealDialogVisible = ref(false)
const policyDialogVisible = ref(false)
const selectedReport = ref<GovernanceReport | null>(null)
const selectedAppeal = ref<GovernanceAppeal | null>(null)
const editingPolicy = ref<CommunityPolicy | null>(null)
const reportFormRef = ref()
const appealFormRef = ref()
const policyFormRef = ref()
const reportForm = reactive({ status: 'resolved' as 'resolved' | 'rejected', action: 'none' as 'none' | 'hide' | 'restore', resolution: '', takedownReason: '' })
const appealForm = reactive({ decision: 'accepted' as 'accepted' | 'rejected', resolution: '' })
const policyForm = reactive<PolicyPayload>({ kind: 'community', category: '', title: '', summary: '', content: '', version: '', effectiveAt: '', status: 'published' })

const pagination = computed(() => ({ current: query.page, pageSize: query.pageSize, total: activeTab.value === 'reports' ? reportTotal.value : appealTotal.value, showJumper: true }))
const reportRules: FormProps['rules'] = { resolution: [{ required: true, message: '请填写处置说明', trigger: 'submit' }] }
const appealRules: FormProps['rules'] = { resolution: [{ required: true, message: '请填写复核说明', trigger: 'submit' }] }
const policyRules: FormProps['rules'] = {
  title: [{ required: true, message: '请填写政策标题', trigger: 'submit' }],
  version: [{ required: true, message: '请填写版本号', trigger: 'submit' }],
  content: [{ required: true, message: '请填写政策正文', trigger: 'submit' }],
}
const reportActions = computed(() => {
  const type = selectedReport.value?.targetType
  if (type === 'comment') return [{ label: '不调整内容', value: 'none' }, { label: '删除评论', value: 'hide' }]
  if (type === 'user') return [{ label: '不调整账号', value: 'none' }, { label: '冻结账号', value: 'hide' }, { label: '恢复账号', value: 'restore' }]
  return [{ label: '不调整内容', value: 'none' }, { label: '下架内容', value: 'hide' }, { label: '恢复已处置对象', value: 'restore' }]
})

const targetTypeOptions = [
  { label: '全部对象', value: '' }, { label: '需求', value: 'demand' }, { label: '文章', value: 'article' },
  { label: '企业', value: 'enterprise' }, { label: '评论', value: 'comment' }, { label: '用户', value: 'user' },
]
const statusOptions = [{ label: '全部', value: '' }, { label: '待处理', value: 'pending' }, { label: '已处理', value: 'resolved' }, { label: '已驳回', value: 'rejected' }]
const kindText: Record<string, string> = { agreement_user: '用户协议', agreement_privacy: '隐私政策', community: '社区政策' }
const governanceStatus: Record<string, { label: string; theme: 'default' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: '待处理', theme: 'warning' },
  resolved: { label: '已处理', theme: 'success' },
  rejected: { label: '已驳回', theme: 'danger' },
}

async function load() {
  loading.value = true
  try {
    if (activeTab.value === 'reports') {
      const result = await fetchGovernanceReports(query.page, query.pageSize, reportStatus.value, reportTargetType.value)
      reports.value = result.list
      reportTotal.value = result.total
    } else if (activeTab.value === 'appeals') {
      const result = await fetchGovernanceAppeals(query.page, query.pageSize, appealStatus.value)
      appeals.value = result.list
      appealTotal.value = result.total
    } else {
      policies.value = await fetchCommunityPolicies()
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function onTabChange(value: string | number) { activeTab.value = String(value) as Tab; query.page = 1; load() }
function onPageChange(page: { current: number; pageSize: number }) { query.page = page.current; query.pageSize = page.pageSize; load() }
function onReportFilterChange() { query.page = 1; load() }
function onAppealFilterChange() { query.page = 1; load() }
function openReport(row: GovernanceReport) { selectedReport.value = row; Object.assign(reportForm, { status: 'resolved', action: 'none', resolution: '', takedownReason: '' }); reportDialogVisible.value = true }
function openAppeal(row: GovernanceAppeal) { selectedAppeal.value = row; Object.assign(appealForm, { decision: 'accepted', resolution: '' }); appealDialogVisible.value = true }
function openPolicy(row?: CommunityPolicy) {
  editingPolicy.value = row ?? null
  Object.assign(policyForm, row ? { kind: row.kind, category: row.category, title: row.title, summary: row.summary, content: row.content, version: row.version, effectiveAt: row.effectiveAt ?? '', status: row.status } : { kind: 'community', category: '', title: '', summary: '', content: '', version: '', effectiveAt: '', status: 'published' })
  policyDialogVisible.value = true
}

async function submitReport() {
  if (!selectedReport.value || await reportFormRef.value.validate() !== true) return
  submitting.value = true
  try { await reviewGovernanceReport(selectedReport.value.id, { ...reportForm, resolution: reportForm.resolution.trim() }); MessagePlugin.success('举报已处置'); reportDialogVisible.value = false; await load() }
  catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '处置失败') } finally { submitting.value = false }
}

/** 恢复流：已处置举报重开 review（action=restore），直接恢复被下架的举报对象，无需新的举报 */
async function restoreReport(row: GovernanceReport) {
  const confirm = await new Promise<boolean>((resolve) => {
    const dialog = DialogPlugin.confirm({
      header: `恢复举报对象`,
      body: `确认恢复「${row.targetTitle}」（${row.targetType} · ${row.targetId}）？恢复后对象将重新对外可见。`,
      confirmBtn: '确认恢复',
      cancelBtn: '取消',
      onConfirm: () => { dialog.destroy(); resolve(true) },
      onCancel: () => { dialog.destroy(); resolve(false) },
      onClose: () => resolve(false),
    })
  })
  if (!confirm) return
  submitting.value = true
  try {
    await reviewGovernanceReport(row.id, { status: 'resolved', action: 'restore', resolution: '经复核误判，恢复举报对象' })
    MessagePlugin.success('举报对象已恢复')
    await load()
  } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '恢复失败') } finally { submitting.value = false }
}
async function submitAppeal() {
  if (!selectedAppeal.value || await appealFormRef.value.validate() !== true) return
  submitting.value = true
  try { await reviewGovernanceAppeal(selectedAppeal.value.id, { ...appealForm, resolution: appealForm.resolution.trim() }); MessagePlugin.success('申诉已复核'); appealDialogVisible.value = false; await load() }
  catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '复核失败') } finally { submitting.value = false }
}
async function submitPolicy() {
  if (await policyFormRef.value.validate() !== true) return
  submitting.value = true
  try {
    const payload = { ...policyForm, category: policyForm.category.trim(), title: policyForm.title.trim(), summary: policyForm.summary.trim(), content: policyForm.content.trim(), version: policyForm.version.trim(), effectiveAt: policyForm.effectiveAt?.trim() || null }
    if (editingPolicy.value) await updateCommunityPolicy(editingPolicy.value.id, payload)
    else await createCommunityPolicy(payload)
    MessagePlugin.success(editingPolicy.value ? '政策已更新' : '政策已发布'); policyDialogVisible.value = false; await load()
  } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '保存失败') } finally { submitting.value = false }
}

onMounted(load)
</script>

<template>
  <div class="governance-panel page-fade-in">
    <PageHeader title="信任治理" description="举报仅进入待处理队列，由社区工作人员决定是否调整内容或账号；提交举报不会自动下架或冻结" />
    <div class="page-card">
      <t-tabs :value="activeTab" class="embed-tabs" @change="onTabChange">
        <t-tab-panel value="reports" label="举报处置">
          <div class="filter-row">
            <t-select v-model="reportStatus" :options="statusOptions" style="width: 130px" @change="onReportFilterChange" />
            <t-select v-model="reportTargetType" :options="targetTypeOptions" style="width: 140px" @change="onReportFilterChange" />
          </div>
          <t-table row-key="id" table-layout="fixed" hover resizable :data="reports" :columns="reportColumns" :loading="loading" :pagination="pagination" empty="暂无举报记录" @page-change="onPageChange">
            <template #target="{ row }"><div><span>{{ row.targetTitle }}</span><span class="id-tag-block">{{ row.targetType }} · {{ row.targetId }}</span></div></template>
            <template #status="{ row }"><t-tag :theme="governanceStatus[row.status]?.theme ?? 'default'" variant="light">{{ governanceStatus[row.status]?.label ?? row.status }}</t-tag></template>
            <template #op="{ row }"><t-button v-if="row.status === 'pending'" variant="text" size="small" theme="primary" @click="openReport(row)">处置</t-button><t-button v-else-if="row.status === 'resolved' && row.targetType !== 'comment'" variant="text" size="small" @click="restoreReport(row)">恢复对象</t-button><span v-else class="muted">已处理</span></template>
          </t-table>
        </t-tab-panel>
        <t-tab-panel value="appeals" label="申诉复核">
          <div class="filter-row"><t-select v-model="appealStatus" :options="statusOptions" style="width: 130px" @change="onAppealFilterChange" /></div>
          <t-table row-key="id" table-layout="fixed" hover resizable :data="appeals" :columns="appealColumns" :loading="loading" :pagination="pagination" empty="暂无申诉记录" @page-change="onPageChange">
            <template #target="{ row }"><span class="id-tag">{{ row.targetType }} · {{ row.targetId }}</span></template>
            <template #status="{ row }"><t-tag :theme="governanceStatus[row.status]?.theme ?? 'default'" variant="light">{{ governanceStatus[row.status]?.label ?? row.status }}</t-tag></template>
            <template #op="{ row }"><t-button v-if="row.status === 'pending'" variant="text" size="small" theme="primary" @click="openAppeal(row)">复核</t-button><span v-else class="muted">已复核</span></template>
          </t-table>
        </t-tab-panel>
        <t-tab-panel value="policies" label="协议与政策">
          <div class="filter-row"><t-button theme="primary" @click="openPolicy()">新增政策</t-button></div>
          <t-table row-key="id" table-layout="fixed" hover resizable :data="policies" :columns="policyColumns" :loading="loading" empty="暂无政策版本">
            <template #kind="{ row }"><t-tag variant="light">{{ kindText[row.kind] ?? row.kind }}</t-tag></template>
            <template #policyStatus="{ row }"><t-tag :theme="row.status === 'published' ? 'success' : 'default'" variant="light">{{ row.status === 'published' ? '已发布' : '已归档' }}</t-tag></template>
            <template #policyOp="{ row }"><t-button variant="text" size="small" @click="openPolicy(row)">编辑</t-button></template>
          </t-table>
        </t-tab-panel>
      </t-tabs>
    </div>

    <t-dialog v-model:visible="reportDialogVisible" header="处置举报" width="520px" :confirm-btn="{ content: '提交处置', loading: submitting }" @confirm="submitReport">
      <t-descriptions v-if="selectedReport" :column="1" bordered size="small"><t-descriptions-item label="对象">{{ selectedReport.targetTitle }}（{{ selectedReport.targetType }} · {{ selectedReport.targetId }}）</t-descriptions-item><t-descriptions-item label="举报理由">{{ selectedReport.reason }}{{ selectedReport.detail ? `：${selectedReport.detail}` : '' }}</t-descriptions-item></t-descriptions>
      <t-form ref="reportFormRef" :data="reportForm" :rules="reportRules" label-align="top" class="dialog-form">
        <t-form-item label="处理结果" name="status"><t-radio-group v-model="reportForm.status"><t-radio value="resolved">已处理</t-radio><t-radio value="rejected">驳回举报</t-radio></t-radio-group></t-form-item>
        <t-form-item label="对象动作" name="action"><t-select v-model="reportForm.action" :options="reportActions" /></t-form-item>
        <t-form-item label="处置说明（反馈举报人，不发送给被举报人）" name="resolution"><t-textarea v-model="reportForm.resolution" :maxlength="255" /></t-form-item>
        <t-form-item v-if="reportForm.action === 'hide' && selectedReport?.targetType !== 'user'" label="下架理由（选填）" name="takedownReason">
          <t-textarea v-model="reportForm.takedownReason" :maxlength="255" placeholder="填写后将通过站内信通知内容所属用户；留空不通知" />
        </t-form-item>
      </t-form>
    </t-dialog>
    <t-dialog v-model:visible="appealDialogVisible" header="复核申诉" width="520px" :confirm-btn="{ content: '提交复核', loading: submitting }" @confirm="submitAppeal">
      <t-descriptions v-if="selectedAppeal" :column="1" bordered size="small"><t-descriptions-item label="申诉对象">{{ selectedAppeal.targetType }} · {{ selectedAppeal.targetId }}</t-descriptions-item><t-descriptions-item label="申诉理由">{{ selectedAppeal.reason }}</t-descriptions-item></t-descriptions>
      <t-form ref="appealFormRef" :data="appealForm" :rules="appealRules" label-align="top" class="dialog-form"><t-form-item label="复核决定" name="decision"><t-radio-group v-model="appealForm.decision"><t-radio value="accepted">通过申诉</t-radio><t-radio value="rejected">维持驳回</t-radio></t-radio-group></t-form-item><t-form-item label="复核说明" name="resolution"><t-textarea v-model="appealForm.resolution" :maxlength="255" /></t-form-item></t-form>
    </t-dialog>
    <t-dialog v-model:visible="policyDialogVisible" :header="editingPolicy ? '编辑政策版本' : '新增政策版本'" width="760px" :confirm-btn="{ content: '保存', loading: submitting }" @confirm="submitPolicy">
      <t-form ref="policyFormRef" :data="policyForm" :rules="policyRules" label-align="top"><div class="form-grid"><t-form-item label="类型" name="kind"><t-select v-model="policyForm.kind" :options="[{ label: '社区政策', value: 'community' }, { label: '用户协议', value: 'agreement_user' }, { label: '隐私政策', value: 'agreement_privacy' }]" /></t-form-item><t-form-item label="版本号" name="version"><t-input v-model="policyForm.version" maxlength="32" /></t-form-item><t-form-item label="分类" name="category"><t-input v-model="policyForm.category" maxlength="32" placeholder="社区政策建议填写分类" /></t-form-item><t-form-item label="生效日期" name="effectiveAt"><t-date-picker v-model="policyForm.effectiveAt" value-type="YYYY-MM-DD" clearable /></t-form-item></div><t-form-item label="标题" name="title"><t-input v-model="policyForm.title" maxlength="128" /></t-form-item><t-form-item label="摘要" name="summary"><t-textarea v-model="policyForm.summary" :maxlength="255" /></t-form-item><t-form-item label="正文" name="content"><RichEditor v-model="policyForm.content" :min-height="260" /></t-form-item><t-form-item label="状态" name="status"><t-radio-group v-model="policyForm.status"><t-radio value="published">发布</t-radio><t-radio value="archived">归档</t-radio></t-radio-group></t-form-item></t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.filter-row { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; }
.dialog-form { margin-top: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.muted { color: var(--td-text-color-placeholder); font-size: 12px; }
.id-tag-block { display: block; margin-top: 3px; color: var(--td-text-color-secondary); font-size: 12px; }
</style>
