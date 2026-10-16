<script setup lang="ts">
import { collectAllPages, executeBulk } from '@/utils/bulkOperation'
import RowMoreActions from '@/components/RowMoreActions.vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { ChevronDownIcon, DeleteIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ColumnController from '@/components/ColumnController.vue'
import ArticleFormDialog from '@/components/ArticleFormDialog.vue'
import ArticleScheduleDialog from '@/components/ArticleScheduleDialog.vue'
import ContentTakedownDialog from '@/components/ContentTakedownDialog.vue'
import ArticleReviewDialog from '@/components/ArticleReviewDialog.vue'
import ArticleCommentsDialog from '@/components/ArticleCommentsDialog.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import {
  cancelArticleSchedule,
  deleteArticle,
  fetchArticleDetail,
  fetchArticles,
  publishArticleNow,
  restoreArticle,
  type ArticleQuery,
} from '@/api/contents'
import type { Article } from '@/types'

/* 投稿内容（内容管理 · 用户投稿）：社区个体/社区企业用户投稿，需经审核。
 * 状态机：待审核 →（通过）待发布 /（驳回）已驳回；待发布 → 定时发布中/已发布；已发布 →（下架）待发布。
 * 操作：待审核=详情(审核)；已驳回=详情/归档；待发布=编辑/定时发布/立即发布/归档；定时发布中=详情/取消定时/立即发布；已发布=下架。 */
const loading = ref(false)
const loadError = ref('')
const acting = ref('')
const list = ref<Article[]>([])
const total = ref(0)

/* 状态勾选式筛选（与活动/需求列表同一形态）：6 个可选状态（不含「全部」项）；
 * 默认勾选「待审核 / 待发布 / 定时发布中 / 已发布」，即列表默认不展示「已驳回 / 已关闭」；
 * 全部取消勾选 = 不按状态过滤（显示全部） */
const statusCheckOptions = [
  { label: '待审核', value: 'pending' },
  { label: '已驳回', value: 'rejected' },
  { label: '待发布', value: 'pending_release' },
  { label: '定时发布中', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已关闭', value: 'closed' },
]
const DEFAULT_STATUSES = ['pending', 'pending_release', 'scheduled', 'published']
const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  /* 勾选式状态筛选：数组（useListQueryState 以重复 query 参数同步）；空串占位 = 不按状态过滤 */
  status: [...DEFAULT_STATUSES] as string[],
})

/* 状态勾选面板：勾选即查询；ESC 关闭（t-popup 仅 trigger=focus 内置 ESC 处理） */
const statusPanelVisible = ref(false)
const checkedStatusCount = computed(() => query.status.filter(Boolean).length)

function onStatusPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && statusPanelVisible.value) statusPanelVisible.value = false
}
onMounted(() => window.addEventListener('keydown', onStatusPanelKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onStatusPanelKeydown))

/* 空选 = 不按状态过滤：用单元素空串占位 —— 空数组会被 vue-router 从 URL 中丢弃 */
function onStatusChange(value: (string | number)[]) {
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
  { colKey: 'title', fixed: 'left' as const, title: '投稿', cell: 'title', width: 160, ellipsis: true, resizable: true },
  { colKey: 'author', title: '投稿方', cell: 'author', width: 150, resizable: true , ellipsis: true},
  { colKey: 'columns', title: '栏目', cell: 'columns', width: 110, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 130, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '提交时间', cell: 'createdAt', width: 170, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 180 },
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

let loadRequest = 0
async function load() {
  const requestId = ++loadRequest
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchArticles({ ...query, channel: 'submitted' })
    if (requestId !== loadRequest) return
    list.value = res.list
    total.value = res.total
  } catch (e) {
    if (requestId !== loadRequest) return
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (requestId === loadRequest) loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.status = [...DEFAULT_STATUSES]
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 归档后当前页可能已空：页码越界时回退一页再加载 */
async function reloadAfterRemove() {
  if (list.value.length <= 1 && query.page > 1) query.page -= 1
  await load()
}

/* ---------- 审核（查看详情） ---------- */
const reviewVisible = ref(false)
const viewVisible = ref(false)
const current = ref<Article | null>(null)

function openReview(row: Article) {
  current.value = row
  reviewVisible.value = true
}

/* ---------- 编辑 ---------- */
const formVisible = ref(false)
const currentEdit = ref<Article | null>(null)

async function openEdit(row: Article) {
  try {
    /* 列表不下发正文：编辑前按 id 拉详情补齐 content */
    currentEdit.value = await fetchArticleDetail(row.id)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '文章详情加载失败')
    return
  }
  formVisible.value = true
}

/* ---------- 归档（已驳回/待发布投稿） ---------- */
async function onDelete(row: Article) {
  acting.value = row.id + ':delete'
  try {
    await deleteArticle(row.id)
    MessagePlugin.success('投稿已归档，可在归档管理中恢复')
    await reloadAfterRemove()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：按当前筛选全量拉取，归档所选状态的已驳回 / 待发布投稿 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
/* 一键归档范围快照（状态被排除，见 onBulkArchive） */
let bulkScope: ArticleQuery = { ...query, channel: 'submitted' }
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
const bulkStatuses = [
  { label: '已驳回', value: 'rejected' },
  { label: '待发布', value: 'pending_release' },
  { label: '已关闭', value: 'closed' },
]

function onBulkCancel() {
  bulkCancelled = true
}

async function doBulkArchive(values: string[]) {
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: 0, failed: 0 }
  try {
    const targets = await collectAllPages<Article>(
      (page, pageSize) => fetchArticles({ ...bulkScope, page, pageSize }), () => bulkCancelled,
    )
    const pending = targets.filter((row) => values.includes(row.status))
    if (!pending.length) {
      MessagePlugin.info(bulkCancelled ? '已取消，未执行归档' : '当前筛选范围内没有符合所选状态的记录')
      return
    }
    const result = await executeBulk(pending, (row) => deleteArticle(row.id), () => bulkCancelled,
      (progress) => { bulkProgress.value = progress })
    if (bulkCancelled) MessagePlugin.warning(`已取消，本次已归档 ${result.done - result.failed} 条投稿`)
    else if (result.done > result.failed) MessagePlugin.success(`已归档 ${result.done - result.failed} 条投稿`)
    if (result.failed) MessagePlugin.warning(`${result.failed} 条归档失败，请刷新后重试`)
    await load()
  } finally {
    bulkProgress.value = null
  }
}

/* 确认前预估影响条数：按所选状态取 total 求和（pageSize=1 仅取 total）；
 * 当前列表状态筛选（勾选式数组；全不选为空串占位=不筛选）不含该状态时预估为 0 */
function countByStatus(status: string) {
  const scopeStatus = bulkScope.status
  const activeStatuses = (Array.isArray(scopeStatus) ? scopeStatus : [scopeStatus]).filter(Boolean)
  if (activeStatuses.length > 0 && !activeStatuses.includes(status)) return Promise.resolve(0)
  return fetchArticles({ ...bulkScope, status, page: 1, pageSize: 1 }).then((result) => result.total)
}

function onBulkArchive() {
  /* 一键归档范围不含状态筛选（同活动/需求列表口径）：默认状态集已隐藏「已驳回/已关闭」，
   * 若把状态带入范围，可归档状态恒为 0 条，归档入口失效 */
  bulkScope = { ...query, channel: 'submitted', status: '' }
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

/* ---------- 定时发布 / 取消定时 ---------- */
const scheduleVisible = ref(false)

function openSchedule(row: Article) {
  current.value = row
  scheduleVisible.value = true
}

async function onCancelSchedule(row: Article) {
  acting.value = row.id + ':cancel-schedule'
  try {
    await cancelArticleSchedule(row.id)
    MessagePlugin.success('已取消定时发布，文章转入待发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* ---------- 立即发布 / 下架 ---------- */
async function onPublishNow(row: Article) {
  acting.value = row.id + ':publish'
  try {
    await publishArticleNow(row.id)
    MessagePlugin.success('文章已发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onRestore(row: Article) {
  acting.value = row.id + ':restore'
  try {
    await restoreArticle(row.id)
    MessagePlugin.success('文章已恢复发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '恢复失败')
  } finally {
    acting.value = ''
  }
}

const takedownDialog = ref<InstanceType<typeof ContentTakedownDialog>>()
const commentsRef = ref<InstanceType<typeof ArticleCommentsDialog>>()
function onWithdraw(row: Article) {
  takedownDialog.value?.open('article', row)
}

/* ---------- 查看详情（定时发布中只读） ---------- */
function openView(row: Article) {
  current.value = row
  viewVisible.value = true
}

/* 行点击：待审核进入审核，其余状态只读详情 */
function onRowClick({ row }: { row: Article }) {
  if (row.status === 'pending') openReview(row)
  else openView(row)
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="article-submission page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="投稿内容" description="社区个体/企业用户投稿文章，审核通过后进入待发布，可定时或立即上架">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="article-submissions"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :loading="archivingAll" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索标题/编号'" class="ctl-w-xl" v-model="query.keyword" clearable placeholder="搜索标题/编号…" @enter="onSearch" />
      <!-- 状态：勾选式多选（默认勾选 4 项，全部取消 = 不按状态过滤）；勾选即查询 -->
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
            <t-checkbox-group :value="query.status" :options="statusCheckOptions" @change="onStatusChange" />
          </div>
        </template>
      </t-popup>
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :row-attributes="{ style: { cursor: 'pointer' } }"
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
        @row-click="onRowClick"
      >
        <template #title="{ row }">
          <div class="cell-title">
            <span class="title-text" :title="row.title">{{ row.title }}</span>
            <span class="title-sub">{{ row.id }}</span>
          </div>
        </template>
        <template #author="{ row }">
          <div class="cell-author">
            <span>{{ row.authorName || '—' }}<t-tag v-if="row.authorId" class="id-tag" size="small" variant="light">{{ row.authorId }}</t-tag></span>
            <span v-if="row.rejectedReason" class="reject-reason" :title="row.rejectedReason">已驳回：{{ row.rejectedReason }}</span>
          </div>
        </template>
        <template #createdAt="{ row }">{{ row.createdAt || '—' }}</template>
        <template #columns="{ row }">
          <div class="col-tags">
            <template v-if="row.columnNames?.length">
              <t-tag v-for="c in row.columnNames" :key="c" variant="light" size="small">{{ c }}</t-tag>
            </template>
            <span v-else class="muted-dash">—</span>
          </div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="article" :value="row.status" :scheduled-at="row.scheduledAt" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 详情：行点击的键盘可达替代（待审核行点击进审核，其余状态进只读详情） -->
            <t-button theme="primary" variant="text" size="small" @click="openView(row)">详情</t-button>
            <t-button v-if="row.status === 'pending_release'" variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <t-button v-if="row.status === 'pending'" variant="text" size="small" @click="openReview(row)">
              审核
            </t-button>
            <RowMoreActions v-if="row.status !== 'pending'">
            <!-- 待审核：进入审核（可驳回/通过） -->

            <!-- 待发布：编辑 / 定时发布 / 立即发布 / 归档 -->
            <template v-if="row.status === 'pending_release'">

              <t-button variant="text" size="small" @click="openSchedule(row)">定时发布</t-button>
              <t-popconfirm content="确认立即发布该文章？" confirm-btn="立即发布" @confirm="onPublishNow(row)">
                <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':publish'">
                  立即发布
                </t-button>
              </t-popconfirm>
              <t-popconfirm
                content="确认归档该投稿？归档后可在归档管理中恢复"
                confirm-btn="归档"
                @confirm="onDelete(row)"
              >
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>

            <!-- 定时发布中：取消定时发布 / 立即发布 -->
            <template v-else-if="row.status === 'scheduled'">
              <t-popconfirm content="确认取消定时发布？该文章将转为「待发布」" confirm-btn="确认取消" @confirm="onCancelSchedule(row)">
                <t-button
                  variant="text"
                  size="small"
                  theme="warning"
                  :loading="acting === row.id + ':cancel-schedule'"
                >
                  取消定时发布
                </t-button>
              </t-popconfirm>
              <t-popconfirm content="确认立即发布该文章？" confirm-btn="立即发布" @confirm="onPublishNow(row)">
                <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':publish'">
                  立即发布
                </t-button>
              </t-popconfirm>
            </template>

            <!-- 已发布：评论治理 / 下架（转待发布） -->
            <template v-else-if="row.status === 'published'">
              <t-button variant="text" size="small" @click="commentsRef?.open(row)">评论</t-button>
              <t-button variant="text" size="small" theme="danger" @click="onWithdraw(row)">
                下架
              </t-button>
            </template>

            <!-- 已驳回：归档（移入归档管理，可恢复） -->
            <template v-else-if="row.status === 'rejected'">
              <t-popconfirm
                content="确认归档该投稿？归档后可在归档管理中恢复"
                confirm-btn="归档"
                @confirm="onDelete(row)"
              >
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>
            <template v-else-if="row.status === 'closed'">
              <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':restore'" @click="onRestore(row)">恢复</t-button>
              <t-popconfirm
                content="确认归档该已关闭投稿？"
                confirm-btn="归档"
                @confirm="onDelete(row)"
              >
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>
            </RowMoreActions>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无投稿" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <ArticleReviewDialog v-model:visible="reviewVisible" :article="current" @success="load" />
    <ArticleReviewDialog v-model:visible="viewVisible" :article="current" readonly title="文章详情" />
    <ArticleFormDialog v-model:visible="formVisible" mode="edit" :article="currentEdit" channel="submitted" @success="load" />
    <ArticleScheduleDialog v-model:visible="scheduleVisible" :article="current" @success="load" />
    <ContentTakedownDialog ref="takedownDialog" @success="load" />
    <ArticleCommentsDialog ref="commentsRef" @success="load" />

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 投稿"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      :progress="bulkProgress"
      @confirm="onBulkConfirm"
      @cancel="onBulkCancel"

      :count-for-status="countByStatus"
    />
  </div>
</template>

<style scoped>
/* 本页 .cell-title 是「标题 + 副行」的列容器而非标题文本本身，
 * 需抵消全局 .cell-title 的字重，避免标题列整体变粗 */
.cell-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-weight: normal;
}

.title-text {
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-sub {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cell-author {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.reject-reason {
  font-size: 12px;
  color: var(--td-error-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
  white-space: nowrap;
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
