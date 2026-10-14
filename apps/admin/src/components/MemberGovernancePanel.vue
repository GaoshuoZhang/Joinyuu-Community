<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import ColumnController from '@/components/ColumnController.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useListQueryState } from '@/utils/listQuery'
import { fetchDeletions, reviewDeletion, type DeletionRow } from '@/api/memberGovernance'

const status = ref('')
const page = ref(1)
const loading = ref(false)
const loadError = ref('')
const total = ref(0)
const rows = ref<DeletionRow[]>([])
const visible = ref(false)
const submitting = ref(false)
const selectedId = ref('')
const selectedName = ref('')
const form = reactive({ action: 'reject' as 'approve' | 'reject', note: '' })

const allColumns = [
  { colKey: 'id', title: '工单编号', width: 115 }, { colKey: 'user', title: '用户', width: 160 },
  { colKey: 'reason', title: '申请原因', width: 190 }, { colKey: 'requestedAt', title: '申请时间', width: 170 },
  { colKey: 'effectiveAt', title: '冷静期届满', width: 180 }, { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'reviewNote', title: '复核说明', width: 200 }, { colKey: 'op', title: '操作', width: 190 },
]
const visibleKeys = ref<string[]>([])
const columns = computed(() => allColumns.filter((column) => !visibleKeys.value.length || visibleKeys.value.includes(column.colKey)))
const options = [{ value: '', label: '全部状态' }, { value: 'cooling', label: '待处理' }, { value: 'approved', label: '已注销' }, { value: 'rejected', label: '已驳回' }, { value: 'cancelled', label: '已撤回' }]
const { syncQuery } = useListQueryState({}, load, { refs: { status, page } })
let version = 0

function cooling(row: DeletionRow) { return !!row.effectiveAt && new Date(row.effectiveAt.replace(' ', 'T')).getTime() > Date.now() }
/* 冷静期剩余时长：≥48 小时按天展示，避免「剩余 72 小时」这类长时长难读 */
function remaining(row: DeletionRow) {
  if (!cooling(row)) return '已届满，可复核'
  const h = Math.ceil((new Date(row.effectiveAt!.replace(' ', 'T')).getTime() - Date.now()) / 3600000)
  return h >= 48 ? `剩余 ${Math.ceil(h / 24)} 天` : `剩余 ${h} 小时`
}
async function load() {
  const current = ++version
  syncQuery(); loading.value = true; loadError.value = ''
  try {
    const result = await fetchDeletions(page.value, status.value)
    if (current === version) { rows.value = result.list; total.value = result.total }
  } catch (error) { if (current === version) loadError.value = error instanceof Error ? error.message : '加载失败' }
  finally { if (current === version) loading.value = false }
}
/* 空态筛选判定：状态筛选非空时提示「清除筛选」 */
const filterState = computed(() => ({ status: status.value }))
function onClearFilter() { status.value = ''; page.value = 1; load() }
function open(row: DeletionRow, action: 'approve' | 'reject') {
  selectedId.value = row.id
  selectedName.value = row.user.nickname
  Object.assign(form, { action, note: '' }); visible.value = true
}
async function submit() {
  if (!form.note.trim()) return void MessagePlugin.warning('请填写复核说明')
  submitting.value = true
  try {
    await reviewDeletion(selectedId.value, form.action, form.note.trim())
    visible.value = false; MessagePlugin.success('复核已完成'); await load()
  } catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '复核失败') }
  finally { submitting.value = false }
}
onMounted(load)
</script>

<template>
  <!-- 筛选栏置于卡片外（契约：筛选栏不进入 .page-card） -->
  <div class="page-filter-bar">
    <t-select v-model="status" :options="options" label="状态" class="ctl-w-md" @change="page = 1; load()" />
    <ColumnController v-model="visibleKeys" storage-key="member-governance-deletions" :columns="allColumns.map(column => ({ key: column.colKey, title: column.title }))" />
  </div>
  <div class="page-card">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <t-table row-key="id" :data="rows" :columns="columns" :loading="loading" table-layout="fixed" hover resizable :pagination="{ current: page, pageSize: 20, total, showPageSize: false }" @page-change="(value: { current: number }) => { page = value.current; load() }">
      <template #user="{ row }"><span>{{ row.user.nickname }}</span><t-tag class="id-tag-block" size="small" variant="light">{{ row.userId }}</t-tag></template>
      <template #id="{ row }"><t-tag class="id-tag" size="small" variant="light">{{ row.id }}</t-tag></template>
      <template #effectiveAt="{ row }">{{ row.effectiveAt || '—' }}<p v-if="row.status === 'cooling'" class="field-help">{{ remaining(row) }}</p></template>
      <template #status="{ row }"><StatusTag entity="accountDeletion" :value="row.status" /></template>
      <template #op="{ row }"><template v-if="row.status === 'cooling'"><t-button variant="text" theme="danger" :disabled="cooling(row)" @click="open(row, 'approve')">确认注销</t-button><t-button variant="text" @click="open(row, 'reject')">驳回</t-button><p v-if="cooling(row)" class="field-help">冷静期未满，暂不可注销</p></template><span v-else>—</span></template>

      <template #empty>
        <ListEmptyState :query="filterState" description="暂无注销申请" @clear="onClearFilter" />
      </template>
    </t-table>
  </div>
  <t-dialog v-model:visible="visible" :header="`${form.action === 'approve' ? '确认通过' : '确认驳回'} · ${selectedName}`" :confirm-btn="{ content: '确认执行', loading: submitting, theme: form.action === 'approve' ? 'danger' : 'primary' }" @confirm="submit">
    <p v-if="form.action === 'approve'">执行后账号将注销，登录会话失效，个人资料清除，业务历史保留。</p>
    <t-form :data="form" label-align="top"><t-form-item label="复核说明" name="note" :rules="[{ required: true, message: '请填写复核说明', trigger: 'submit' }]"><t-textarea v-model="form.note" :maxlength="255" placeholder="填写复核依据或驳回原因…" /></t-form-item></t-form>
  </t-dialog>
</template>
