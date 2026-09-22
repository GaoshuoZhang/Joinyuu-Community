<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ColumnController from '@/components/ColumnController.vue'
import ArticleFormDialog from '@/components/ArticleFormDialog.vue'
import ArticleScheduleDialog from '@/components/ArticleScheduleDialog.vue'
import ContentTakedownDialog from '@/components/ContentTakedownDialog.vue'
import ArticleReviewDialog from '@/components/ArticleReviewDialog.vue'
import ArticleCommentsDialog from '@/components/ArticleCommentsDialog.vue'
import {
  cancelArticleSchedule,
  deleteArticle,
  fetchArticles,
  publishArticleNow,
  restoreArticle,
} from '@/api/contents'
import type { Article, ArticleStatus } from '@/types'

/* 资讯发布（内容管理 · 官方）：社区自行发布文章。
 * 状态机：待发布 → 定时发布中/已发布；定时发布中 → 已发布；已发布 →（下架）待发布。
 * 规则与「投稿内容」的三态一致：待发布=编辑/定时发布/立即发布/归档；定时发布中=查看详情/取消定时/立即发布；已发布=下架。 */
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
  { label: '待发布', value: 'pending_release' },
  { label: '定时发布中', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已关闭', value: 'closed' },
]

const columns = [
  { colKey: 'title', title: '资讯', cell: 'title', width: 160, ellipsis: true, resizable: true },
  { colKey: 'author', title: '作者', cell: 'author', width: 150, resizable: true , ellipsis: true},
  { colKey: 'columns', title: '栏目', cell: 'columns', width: 110, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 130, resizable: true , ellipsis: true},
  { colKey: 'publishedAt', title: '发布时间', cell: 'publishedAt', width: 160, resizable: true , ellipsis: true},
  { colKey: 'views', title: '阅读量', width: 80 , ellipsis: true},
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
    const res = await fetchArticles({ ...query, channel: 'official', status: query.status || undefined })
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

/* ---------- 新增 / 编辑 ---------- */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const current = ref<Article | null>(null)

function openCreate() {
  formMode.value = 'create'
  current.value = null
  formVisible.value = true
}

function openEdit(row: Article) {
  formMode.value = 'edit'
  current.value = row
  formVisible.value = true
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

/* ---------- 归档（待发布资讯） ---------- */
async function onDelete(row: Article) {
  acting.value = row.id + ':delete'
  try {
    await deleteArticle(row.id)
    MessagePlugin.success('资讯已归档')
    await reloadAfterRemove()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档失败')
  } finally {
    acting.value = ''
  }
}

/* ---------- 查看详情（定时发布中只读） ---------- */
const viewVisible = ref(false)

function openView(row: Article) {
  current.value = row
  viewVisible.value = true
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="article-publish page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="资讯发布" description="社区自行发布运营资讯，新增即待发布，可按需定时或立即上架">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="article-publish"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          发布资讯
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
        @row-click="({ row }: { row: Article }) => openView(row)"
      >
        <template #title="{ row }">
          <div class="cell-title">
            <span class="title-text">{{ row.title }}</span>
            <span class="title-sub">{{ row.id }}</span>
          </div>
        </template>
        <template #author="{ row }">
            <span>{{ row.authorName || '—' }}<t-tag v-if="row.authorId" class="id-tag" size="small" variant="light">{{ row.authorId }}</t-tag></span>
          </template>
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
        <template #publishedAt="{ row }">{{ row.publishedAt ?? '—' }}</template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 待发布：编辑 / 定时发布 / 立即发布 / 归档；查看详情靠行点击 -->
            <template v-if="row.status === 'pending_release'">
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-button variant="text" size="small" @click="openSchedule(row)">定时发布</t-button>
              <t-popconfirm content="确认立即发布该文章？" @confirm="onPublishNow(row)">
                <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':publish'">
                  立即发布
                </t-button>
              </t-popconfirm>
              <t-popconfirm content="确认归档该资讯？归档后可在归档管理中恢复" @confirm="onDelete(row)">
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
            <template v-else-if="row.status === 'closed'">
              <t-button variant="text" size="small" theme="primary" :loading="acting === row.id + ':restore'" @click="onRestore(row)">恢复</t-button>
              <t-popconfirm content="确认归档该已关闭资讯？" @confirm="onDelete(row)">
                <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                  <template #icon><DeleteIcon /></template>
                  归档
                </t-button>
              </t-popconfirm>
            </template>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="query" description="暂无资讯" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <ArticleFormDialog v-model:visible="formVisible" :mode="formMode" :article="current" channel="official" @success="load" />
    <ArticleScheduleDialog v-model:visible="scheduleVisible" :article="current" @success="load" />
    <ContentTakedownDialog ref="takedownDialog" @success="load" />
    <ArticleReviewDialog v-model:visible="viewVisible" :article="current" readonly title="文章详情" />
    <ArticleCommentsDialog ref="commentsRef" @success="load" />
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
