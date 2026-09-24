<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { DeleteIcon, SearchIcon } from 'tdesign-icons-vue-next'
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
  fetchArticles,
  publishArticleNow,
  restoreArticle,
} from '@/api/contents'
import type { Article, ArticleStatus } from '@/types'

/* 投稿内容（内容管理 · 用户投稿）：社区个体/社区企业用户投稿，需经审核。
 * 状态机：待审核 →（通过）待发布 /（驳回）已驳回；待发布 → 定时发布中/已发布；已发布 →（下架）待发布。
 * 操作：待审核=详情(审核)；已驳回=详情/归档；待发布=编辑/定时发布/立即发布/归档；定时发布中=详情/取消定时/立即发布；已发布=下架。 */
const loading = ref(false)
const loadError = ref('')
const acting = ref('')
const list = ref<Article[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '' as ArticleStatus | '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '待审核', value: 'pending' },
  { label: '已驳回', value: 'rejected' },
  { label: '待发布', value: 'pending_release' },
  { label: '定时发布中', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已关闭', value: 'closed' },
]

const columns = [
  { colKey: 'title', title: '投稿', cell: 'title', width: 160, ellipsis: true, resizable: true },
  { colKey: 'author', title: '投稿方', cell: 'author', width: 150, resizable: true , ellipsis: true},
  { colKey: 'columns', title: '栏目', cell: 'columns', width: 110, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 130, resizable: true , ellipsis: true},
  { colKey: 'createdAt', title: '提交时间', cell: 'createdAt', width: 170, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 300 },
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

async function load() {
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchArticles({ ...query, channel: 'submitted', status: query.status || undefined })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
    MessagePlugin.error(e instanceof Error ? e.message : '数据加载失败')
  } finally {
    loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.status = ''
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

function openEdit(row: Article) {
  currentEdit.value = row
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
  const targets: Article[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetchArticles({ ...query, channel: 'submitted', page, pageSize: 100, status: query.status || undefined })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
  }
  const pending = targets.filter((a) => values.includes(a.status))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档投稿')
    return
  }
  /* 进度 + 可取消：逐条执行，取消后停止后续条目（见 BulkArchiveDialog 进度态） */
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: pending.length, failed: 0 }
  let done = 0
  let failed = 0
  for (const a of pending) {
    if (bulkCancelled) break
    try {
      await deleteArticle(a.id)
    } catch {
      failed++
    }
    done++
    bulkProgress.value = { done, total: pending.length, failed }
  }
  bulkProgress.value = null
  if (bulkCancelled) {
    MessagePlugin.warning(`已取消执行：本次已归档 ${done - failed} 条`)
  } else {
    if (done - failed > 0) MessagePlugin.success(`已归档 ${done - failed} 条投稿`)
    if (failed > 0) MessagePlugin.warning(`${failed} 条投稿归档失败，请重试`)
  }
  await load()
}

function onBulkArchive() {
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
      <t-input class="ctl-w-xl" v-model="query.keyword" clearable placeholder="搜索标题/编号…" @enter="onSearch" />
      <t-select class="ctl-w-md" v-model="query.status" label="状态" :options="statusOptions" @change="onSearch" />
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
            <span class="title-text">{{ row.title }}</span>
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
            <!-- 待审核：进入审核（可驳回/通过）；其余状态查看详情靠行点击 -->
            <t-button v-if="row.status === 'pending'" variant="text" size="small" @click="openReview(row)">
              审核
            </t-button>
            <!-- 待发布：编辑 / 定时发布 / 立即发布 / 归档 -->
            <template v-if="row.status === 'pending_release'">
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-button variant="text" size="small" @click="openSchedule(row)">定时发布</t-button>
              <t-popconfirm content="确认立即发布该文章？" @confirm="onPublishNow(row)">
                <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':publish'">
                  立即发布
                </t-button>
              </t-popconfirm>
              <t-popconfirm content="确认归档该投稿？归档后可在归档管理中恢复" @confirm="onDelete(row)">
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>

            <!-- 定时发布中：取消定时发布 / 立即发布 -->
            <template v-else-if="row.status === 'scheduled'">
              <t-popconfirm content="确认取消定时发布？该文章将转为「待发布」" @confirm="onCancelSchedule(row)">
                <t-button
                  variant="text"
                  size="small"
                  theme="warning"
                  :loading="acting === row.id + ':cancel-schedule'"
                >
                  取消定时发布
                </t-button>
              </t-popconfirm>
              <t-popconfirm content="确认立即发布该文章？" @confirm="onPublishNow(row)">
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
              <t-popconfirm content="确认归档该投稿？归档后可在归档管理中恢复" @confirm="onDelete(row)">
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>
            <template v-else-if="row.status === 'closed'">
              <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':restore'" @click="onRestore(row)">恢复</t-button>
              <t-popconfirm content="确认归档该已关闭投稿？" @confirm="onDelete(row)">
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>
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
</style>
