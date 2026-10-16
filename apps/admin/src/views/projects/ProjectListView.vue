<script setup lang="ts">
import { collectAllPages, executeBulk } from '@/utils/bulkOperation'
import RowMoreActions from '@/components/RowMoreActions.vue'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, ChevronDownIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ColumnController from '@/components/ColumnController.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import { fetchProjects, pauseProject, resumeProject, closeProject, archiveProject, type ProjectQuery } from '@/api/projects'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchEnterprise } from '@/api/enterprises'
import { fetchExternalEnterprise } from '@/api/external-enterprises'
import { fetchUser } from '@/api/users'
import { statusLabel } from '@/utils/exportCsv'
import { userIdentitySummary, userSubjectLabel } from '@/utils/subjectLabel'
import type { Project } from '@/types'

const router = useRouter()
const loading = ref(true)
const loadError = ref('')
/* 当前执行中的行操作标识：`${id}:pause | resume | close | archive` */
const acting = ref('')
const list = ref<Project[]>([])
const total = ref(0)
/* 用户详情「数据概览」跳转带入的参与人筛选 */
const participantName = ref('')
/* 企业详情「数据概览」跳转带入的企业筛选（值为社区企业 ID 或合作企业 ID，标签显示名称） */
const enterpriseName = ref('')

/* 状态勾选式筛选（与活动/需求管理同一形态）：4 个可选状态（不含「全部」项）；
 * 默认勾选「进行中 / 已暂停」，即列表默认不展示「已关闭 / 已结项」；
 * 全部取消勾选 = 不按状态过滤（显示全部） */
const statusCheckOptions = [
  { label: '进行中', value: 'running' },
  { label: '已暂停', value: 'paused' },
  { label: '已关闭', value: 'closed' },
  { label: '已结项', value: 'finished' },
]
const DEFAULT_STATUSES = ['running', 'paused']

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  /* 勾选式状态筛选：数组（useListQueryState 以重复 query 参数同步）；空串占位 = 不按状态过滤 */
  status: [...DEFAULT_STATUSES] as string[],
  participant: '',
  enterprise: '',
})

/* 排序：默认立项日期倒序（最新立项在前），支持立项日期正/倒序 */
const sortBy = ref<'initiatedAt' | 'id'>('initiatedAt')
const sortOrder = ref<'ascend' | 'descend'>('descend')

/* 状态勾选面板（与活动/需求管理同一形态）：勾选即查询；ESC 关闭（t-popup 仅 trigger=focus 内置 ESC 处理）。
 * 行操作已占用 onStatusChange（暂停/恢复），故此处命名为 onStatusFilterChange */
const statusPanelVisible = ref(false)
const checkedStatusCount = computed(() => query.status.filter(Boolean).length)

function onStatusPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && statusPanelVisible.value) statusPanelVisible.value = false
}
onMounted(() => window.addEventListener('keydown', onStatusPanelKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onStatusPanelKeydown))

/* 空选 = 不按状态过滤：用单元素空串占位 —— 空数组会被 vue-router 从 URL 中丢弃 */
function onStatusFilterChange(value: (string | number)[]) {
  const picked = value.map(String).filter(Boolean)
  query.status = picked.length ? picked : ['']
  onSearch()
}

function selectAllStatuses() {
  query.status = statusCheckOptions.map((o) => o.value)
  onSearch()
}

function clearAllStatuses() {
  query.status = ['']
  onSearch()
}

const columns = [
  { colKey: 'name', fixed: 'left' as const, title: '项目', cell: 'name', width: 140, ellipsis: true, resizable: true },
  { colKey: 'undertakers', title: '承接方', cell: 'undertakers', width: 140, ellipsis: true, resizable: true },
  {
    colKey: 'initiatedAt',
    title: '立项日期',
    width: 170,
    resizable: true,
    sorter: true,
    sortType: 'all',
  ellipsis: true,
  },
  { colKey: 'progress', title: '进度', cell: 'progress', width: 120, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 86, resizable: true , ellipsis: true},
  { colKey: 'duration', title: '起止时间', cell: 'duration', width: 220, resizable: true , ellipsis: true},
  { colKey: 'op', fixed: 'right' as const, title: '操作', cell: 'op', width: 180 },
]

/* 列配置：本地持久化显隐/顺序 */
const visibleColKeys = ref<string[]>(columns.map((c) => c.colKey))

const visibleColumns = computed(() => {
  const byKey = new Map(columns.map((c) => [c.colKey, c]))
  return visibleColKeys.value.map((k) => byKey.get(k)).filter(Boolean)
})

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

/* 请求序号守卫：仅最后一次请求可写回状态，避免快速切页/改筛选时的竞态覆盖 */
let version = 0
async function load() {
  const current = ++version
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchProjects({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    if (current === version) {
      list.value = res.list
      total.value = res.total
    }
  } catch (e) {
    if (current === version) loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (current === version) loading.value = false
  }
}

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'initiatedAt') return
  sortBy.value = 'initiatedAt'
  sortOrder.value = sort.descending ? 'descend' : 'ascend'
  query.page = 1
  load()
}

const tableSort = computed(() => ({
  sortBy: sortBy.value,
  descending: sortOrder.value === 'descend',
}))

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.status = [...DEFAULT_STATUSES]
  query.participant = ''
  query.enterprise = ''
  participantName.value = ''
  enterpriseName.value = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 新增项目 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formProject = ref<Project | null>(null)

function openCreate() {
  formMode.value = 'create'
  formProject.value = null
  formVisible.value = true
}

/* 编辑项目：除已结项/已关闭外均可编辑（不改状态/编号） */
function openEdit(row: Project) {
  formMode.value = 'edit'
  formProject.value = row
  formVisible.value = true
}

/* 已关闭 → 重新新增（以该项目为模板预填，保存为新项目） */
function openRecreate(row: Project) {
  formMode.value = 'create'
  formProject.value = row
  formVisible.value = true
}

async function onStatusChange(row: Project, action: 'pause' | 'resume') {
  acting.value = row.id + ':' + action
  try {
    if (action === 'pause') {
      await pauseProject(row.id)
      MessagePlugin.success('项目已暂停')
    } else {
      await resumeProject(row.id)
      MessagePlugin.success('项目已恢复进行中')
    }
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 关闭弹窗：关闭原因必填 */
const closeVisible = ref(false)
const closeTarget = ref<Project | null>(null)
const closeSaving = ref(false)
const closeFormRef = ref()
const closeForm = reactive({ reason: '' })
const closeRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写关闭原因', trigger: 'submit' }],
}

function openCloseDialog(row: Project) {
  closeTarget.value = row
  closeForm.reason = ''
  closeVisible.value = true
  nextTick(() => closeFormRef.value?.clearValidate())
}

async function onConfirmClose() {
  if (!closeTarget.value) return
  const valid = await closeFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(closeFormRef.value)
  closeSaving.value = true
  try {
    await closeProject(closeTarget.value.id, closeForm.reason)
    MessagePlugin.success('项目已关闭')
    closeVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    closeSaving.value = false
  }
}

/* 已结项/已关闭 → 归档（可在归档管理中恢复） */
async function onArchive(row: Project) {
  acting.value = row.id + ':archive'
  try {
    await archiveProject(row.id)
    MessagePlugin.success('项目已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：按当前筛选全量拉取，归档所选状态的已结项 / 已关闭项目 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
/* 一键归档范围快照（状态被排除，见 onBulkArchive） */
let bulkScope: ProjectQuery = { ...query }
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
const bulkStatuses = [
  { label: '已结项', value: 'finished' },
  { label: '已关闭', value: 'closed' },
]

function onBulkCancel() {
  bulkCancelled = true
}

async function doBulkArchive(values: string[]) {
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: 0, failed: 0 }
  try {
    const targets = await collectAllPages<Project>(
      (page, pageSize) => fetchProjects({ ...bulkScope, page, pageSize }), () => bulkCancelled,
    )
    const pending = targets.filter((row) => values.includes(row.status))
    if (!pending.length) {
      MessagePlugin.info(bulkCancelled ? '已取消，未执行归档' : '当前筛选范围内没有符合所选状态的记录')
      return
    }
    const result = await executeBulk(pending, (row) => archiveProject(row.id), () => bulkCancelled,
      (progress) => { bulkProgress.value = progress })
    if (bulkCancelled) MessagePlugin.warning(`已取消，本次已归档 ${result.done - result.failed} 条项目`)
    else if (result.done > result.failed) MessagePlugin.success(`已归档 ${result.done - result.failed} 条项目`)
    if (result.failed) MessagePlugin.warning(`${result.failed} 条归档失败，请刷新后重试`)
    await load()
  } finally {
    bulkProgress.value = null
  }
}

/* 确认前预估影响条数：按所选状态取 total（pageSize=1 仅取 total）；
 * 当前列表状态筛选（勾选式数组；全不选为空串占位=不筛选）不含该状态时预估为 0 */
function countByStatus(status: string) {
  const scopeStatus = bulkScope.status
  const activeStatuses = (Array.isArray(scopeStatus) ? scopeStatus : [scopeStatus]).filter(Boolean)
  if (activeStatuses.length > 0 && !activeStatuses.includes(status)) return Promise.resolve(0)
  return fetchProjects({ ...bulkScope, status, page: 1, pageSize: 1 }).then((result) => result.total)
}

function onBulkArchive() {
  /* 一键归档范围不含状态筛选（同活动/需求列表口径）：默认状态集已隐藏「已结项/已关闭」，
   * 若把状态带入范围，两个可归档状态恒为 0 条，归档入口失效 */
  bulkScope = { ...query, status: '' }
  bulkVisible.value = true
}

async function onBulkConfirm(values: string[]) {
  archivingAll.value = true
  try {
    await doBulkArchive(values)
    bulkVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '一键归档失败')
  } finally {
    archivingAll.value = false
  }
}

function goDetail(row: Project) {
  router.push(`/projects/${row.id}`)
}

/* 起止时间展示：字段为空时回退到固定里程碑「项目立项/预期交付」日期（与详情页口径一致）。
 * 列表拆为上下两行（首行开始、次行结束），导出仍用单行拼接 */
function durationStart(row: Project): string {
  return row.startDate || row.milestones.find((m) => m.name === '项目立项')?.date || ''
}

function durationEnd(row: Project): string {
  return row.endDate || [...row.milestones].reverse().find((m) => m.name === '预期交付')?.date || ''
}

function durationOf(row: Project): string {
  return `${durationStart(row) || '—'} ~ ${durationEnd(row) || '—'}`
}

/* 导出：当前页 / 全部结果（沿用列表筛选） */
const exportHeaders = ['编号', '项目编号', '项目名称', '承接方（占比）', '进度', '状态', '立项日期', '起止时间']

function mapRow(p: Project): (string | number)[] {
  return [
    p.id,
    p.code,
    p.name,
    p.undertakers.map((t) => `${t.name} ${t.share}%`).join('、'),
    `${p.progress}%`,
    statusLabel('project', p.status),
    p.initiatedAt,
    durationOf(p),
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchProjects({ ...query, page, pageSize })
}

function onRowClick({ row }: { row: Project }) {
  goDetail(row)
}

/* 用户详情「数据概览」跳转带入参与人 ID（query: participant），按 ID 过滤避免同名歧义；
 * 企业详情「数据概览」跳转带入企业 ID（query: enterprise，社区企业 E* / 合作企业 XE*），
 * 标签显示名称：社区企业经 fetchEnterprise、合作企业经 fetchExternalEnterprise 由 ID 解析 */
async function applyRouteFilter() {
  participantName.value = ''
  enterpriseName.value = ''
  if (query.participant) {
    try {
      const u = await fetchUser(query.participant)
      participantName.value = userSubjectLabel({ realName: u.realName, nickname: u.nickname, uid: u.uid, identity: userIdentitySummary(u) })
    } catch {
      /* 用户不存在时标签回退显示 ID */
    }
  }
  if (query.enterprise) {
    try {
      const res = await fetchEnterprise(query.enterprise)
      enterpriseName.value = res.enterprise.name
    } catch {
      /* 非社区企业 ID：尝试按合作企业 ID 解析名称 */
      try {
        const ext = await fetchExternalEnterprise(query.enterprise)
        enterpriseName.value = ext.name
      } catch {
        /* 均未命中时标签回退显示原值 */
      }
    }
  }
}

function clearParticipant() {
  query.participant = ''
  participantName.value = ''
  query.page = 1
  load()
}

function clearEnterprise() {
  query.enterprise = ''
  enterpriseName.value = ''
  query.page = 1
  load()
}

watch(() => [query.participant, query.enterprise], applyRouteFilter)

const { syncQuery } = useListQueryState(query, load, { refs: { sortBy, sortOrder } })

onMounted(() => {
  applyRouteFilter()
  load()
})
const { close: closeProjectDialog } = useDialogFormProtection(closeForm, closeVisible, closeSaving)
</script>

<template>
  <div class="project-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <PageHeader title="项目管理" description="跨企业协作项目的新增、承接方与进度管理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="projects"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :loading="archivingAll" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
        <ExportButton
          filename="项目列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增项目
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索项目名称/编号'" class="ctl-w-xl"
        v-model="query.keyword"
        placeholder="搜索项目名称/编号…"
        clearable
        @enter="onSearch"
      />
      <!-- 状态：勾选式多选（默认勾选 2 项，全部取消 = 不按状态过滤）；勾选即查询 -->
      <t-popup
        v-model:visible="statusPanelVisible"
        trigger="click"
        placement="bottom-left"
        :show-arrow="false"
        overlay-class-name="status-filter-popup"
        overlay-inner-class-name="status-filter-popup-inner"
      >
        <t-button variant="outline" :aria-label="`状态筛选，已勾选 ${checkedStatusCount} 项`">
          状态<template v-if="checkedStatusCount">（{{ checkedStatusCount }}）</template>
          <template #suffix><ChevronDownIcon /></template>
        </t-button>
        <template #content>
          <div class="status-panel">
            <div class="status-panel-head">
              <span class="status-panel-title">状态</span>
              <div class="status-panel-tools">
                <t-button
                  variant="text"
                  size="small"
                  :disabled="checkedStatusCount === statusCheckOptions.length"
                  @click="selectAllStatuses"
                >
                  全选
                </t-button>
                <t-button variant="text" size="small" :disabled="checkedStatusCount === 0" @click="clearAllStatuses">
                  清空
                </t-button>
              </div>
            </div>
            <t-checkbox-group :value="query.status" :options="statusCheckOptions" @change="onStatusFilterChange" />
          </div>
        </template>
      </t-popup>
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        重置
      </t-button>
      <t-tag
        v-if="query.participant"
        closable
        variant="light"
        theme="primary"
        @close="clearParticipant"
      >
        参与人：{{ participantName || query.participant }}
      </t-tag>
      <t-tag
        v-if="query.enterprise"
        closable
        variant="light"
        theme="primary"
        @close="clearEnterprise"
      >
        承接企业：{{ enterpriseName || query.enterprise }}
      </t-tag>
    </div>

    <div class="page-card">
      <t-table :horizontal-scroll-affixed-bottom="{ container: '.page-scroll', offsetBottom: 0 }"
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        @row-click="onRowClick"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.code }}</div>
        </template>
        <template #undertakers="{ row }">
          <div class="ent-wrap">
            <t-tag
              v-for="u in row.undertakers.slice(0, 2)"
              :key="u.id + u.type"
              variant="light"
              size="small"
            >
              {{ u.name }}<template v-if="u.id"> [{{ u.id }}]</template> {{ u.share }}%
            </t-tag>
            <span v-if="row.undertakers.length > 2" class="ent-more">
              +{{ row.undertakers.length - 2 }}
            </span>
          </div>
        </template>
        <template #progress="{ row }">
          <t-progress :percentage="row.progress" />
        </template>
        <template #status="{ row }">
          <t-tooltip
            v-if="row.status === 'closed' && row.closeReason"
            :content="'关闭原因：' + row.closeReason"
          >
            <StatusTag entity="project" :value="row.status" />
          </t-tooltip>
          <StatusTag v-else entity="project" :value="row.status" />
        </template>
        <!-- 起止时间：上下两行（首行开始、次行结束），两行同为 14px 时间戳，次行次级色 -->
        <template #duration="{ row }">
          <div class="stack-cell">
            <span>{{ durationStart(row) || '—' }}</span>
            <span class="time-sub">{{ durationEnd(row) || '—' }}</span>
          </div>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 详情：形态与行点击一致，为键盘用户提供显式入口 -->
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
            <t-button
              v-if="row.status !== 'finished' && row.status !== 'closed'"
              variant="text"
              size="small"
              @click="openEdit(row)"
            >
              编辑
            </t-button>
            <RowMoreActions v-if="['running', 'paused', 'finished', 'closed'].includes(row.status)">

            <template v-if="row.status === 'running'">
              <t-popconfirm content="确认暂停该项目？" @confirm="onStatusChange(row, 'pause')">
                <t-button
                  variant="text"
                  size="small"
                  theme="warning"
                  :loading="acting === row.id + ':pause'"
                >
                  暂停
                </t-button>
              </t-popconfirm>
            </template>
            <template v-if="row.status === 'paused'">
              <t-button
                variant="text"
                size="small"
                theme="primary"
                :loading="acting === row.id + ':resume'"
                @click="onStatusChange(row, 'resume')"
              >
                恢复
              </t-button>
              <t-button variant="text" size="small" theme="danger" @click="openCloseDialog(row)">关闭</t-button>
            </template>
            <t-button v-if="row.status === 'closed'" variant="text" size="small" theme="primary" @click="openRecreate(row)">重新新增</t-button>
            <t-popconfirm
              v-if="row.status === 'finished' || row.status === 'closed'"
              content="确认归档该项目？归档后可在归档管理中恢复"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="acting === row.id + ':archive'">归档</t-button>
            </t-popconfirm>
            </RowMoreActions>
          </div>
        </template>
        <template #empty>
          <ListEmptyState :query="query" description="暂无项目数据" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <!-- 新增项目弹窗 -->
    <ProjectFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :demand="null"
      :project="formProject"
      @success="load"
    />
    <!-- 关闭弹窗：关闭原因必填 -->
    <t-dialog
      :visible="closeVisible"
      :header="closeTarget ? `关闭项目 · ${closeTarget.name}` : '关闭项目'"
      width="460px"
      @close="closeProjectDialog"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeProjectDialog">取消</t-button>
          <t-button theme="danger" :loading="closeSaving" @click="onConfirmClose">确认关闭</t-button>
        </div>
      </template>
      <t-form ref="closeFormRef" :data="closeForm" :rules="closeRules" label-align="top">
        <t-form-item label="关闭原因" name="reason">
          <t-textarea
            v-accessible-field
            v-model="closeForm.reason"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请填写关闭原因（必填），将记录在项目信息中…"
          />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 项目"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      :progress="bulkProgress"
      :count-for-status="countByStatus"
      @confirm="onBulkConfirm"
      @cancel="onBulkCancel"

    />
  </div>
</template>

<style scoped>
/* 窄列下按钮文字也不换行（排列方式由全局 .op-cell 提供） */
.op-cell {
  white-space: nowrap;
}

/* 本页标题需要单行省略，其余（字号/字重/主色）由全局 .cell-title 提供 */
.cell-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ent-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.ent-more {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 起止时间两行：上下两行、字号一致；左对齐（时间列不与表头错位，也不做居中对齐） */
.stack-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.time-sub {
  color: var(--td-text-color-secondary);
}

/* ---------- 状态勾选面板（浮层挂载到 body，scoped 选择器无法命中，故用 :global 收窄到本页唯一类名） ---------- */
:global(.status-filter-popup) {
  padding: 0;
}

:global(.status-filter-popup-inner) {
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
}

.status-panel {
  width: 180px;
  padding: 8px 12px 12px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-2);
}

.status-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.status-panel-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-panel :deep(.t-checkbox-group) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
