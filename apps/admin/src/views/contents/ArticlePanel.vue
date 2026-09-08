<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import ArticleFormDialog from '@/components/ArticleFormDialog.vue'
import { fetchArticles, fetchColumns, reviewArticle, submitArticle, withdrawArticle } from '@/api/contents'
import type { Article } from '@/types'

/* 文章管理面板：草稿 → 提交审核 → 审核通过/驳回 → 已发布 → 可下架；
 * 编辑入口仅草稿/已驳回/已下架；审批走意见对话框 */
const loading = ref(false)
const list = ref<Article[]>([])
const total = ref(0)
const acting = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  columnId: '',
  status: '',
})

const columnOptions = ref<{ label: string; value: string }[]>([])

const statusOptions = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '待审核', value: 'pending' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'withdrawn' },
  { label: '已驳回', value: 'rejected' },
]

const columns = [
  { colKey: 'title', title: '文章', cell: 'title', minWidth: 240, resizable: true },
  { colKey: 'columnName', title: '栏目', width: 110, resizable: true },
  { colKey: 'author', title: '作者', cell: 'author', width: 150, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'views', title: '阅读量', width: 90, resizable: true },
  { colKey: 'publishedAt', title: '发布时间', cell: 'publishedAt', width: 150, resizable: true },
  { colKey: 'createdAt', title: '创建时间', width: 150, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 170 },
]

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

async function load() {
  loading.value = true
  try {
    const res = await fetchArticles({ ...query })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

async function loadColumnOptions() {
  if (columnOptions.value.length > 0) return
  try {
    const cols = await fetchColumns()
    columnOptions.value = [
      { label: '全部栏目', value: '' },
      ...cols.map((c) => ({ label: c.name, value: c.id })),
    ]
  } catch {
    /* 筛选选项加载失败不阻塞列表 */
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.columnId = ''
  query.status = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 提交审核：草稿/已驳回/已下架 → 待审核 */
async function onSubmit(row: Article) {
  acting.value = `${row.id}:submit`
  try {
    await submitArticle(row.id)
    MessagePlugin.success('文章已提交审核')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已发布 → 已下架 */
async function onWithdraw(row: Article) {
  acting.value = `${row.id}:withdraw`
  try {
    await withdrawArticle(row.id)
    MessagePlugin.success('文章已下架')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 审核意见对话框（待审核 → 通过 / 驳回） */
const dialogVisible = ref(false)
const dialogAction = ref<'approved' | 'rejected'>('approved')
const current = ref<Article | null>(null)
const comment = ref('')
const submitting = ref(false)

function openDialog(action: 'approved' | 'rejected', row: Article) {
  current.value = row
  dialogAction.value = action
  comment.value = ''
  dialogVisible.value = true
}

async function onConfirm() {
  if (!current.value) return
  submitting.value = true
  try {
    await reviewArticle(current.value.id, dialogAction.value, comment.value)
    MessagePlugin.success(dialogAction.value === 'approved' ? '文章已发布' : '文章已驳回')
    dialogVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

/* 创建 / 编辑文章 */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const currentArticle = ref<Article | null>(null)

function openCreate() {
  formMode.value = 'create'
  currentArticle.value = null
  formVisible.value = true
}

function openEdit(row: Article) {
  formMode.value = 'edit'
  currentArticle.value = row
  formVisible.value = true
}

function isActing(row: Article, action: string) {
  return acting.value === `${row.id}:${action}`
}

function canEdit(row: Article) {
  return row.status === 'draft' || row.status === 'rejected' || row.status === 'withdrawn'
}

onMounted(() => {
  loadColumnOptions()
  load()
})
</script>

<template>
  <div class="article-panel">
    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索文章标题/作者/编号"
        clearable
        style="width: 220px"
        @enter="onSearch"
      />
      <t-select
        v-model="query.columnId"
        label="栏目"
        :options="columnOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 140px"
        @change="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        <template #icon><RefreshIcon /></template>
        重置
      </t-button>
      <t-button theme="primary" class="filter-tail" @click="openCreate">
        <template #icon><AddIcon /></template>
        新建文章
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无文章数据"
        @page-change="onPageChange"
      >
        <template #title="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #author="{ row }">
          <div class="cell-title">{{ row.authorName }}</div>
          <div class="cell-sub">{{ row.authorIdentity?.title ?? '个人用户' }}</div>
        </template>
        <template #status="{ row }">
          <StatusTag entity="article" :value="row.status" />
        </template>
        <template #publishedAt="{ row }">
          {{ row.publishedAt ?? '—' }}
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <!-- 草稿/已驳回/已下架：编辑 + 提交审核 -->
            <template v-if="canEdit(row)">
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-popconfirm content="确认提交审核？通过后将立即发布" @confirm="onSubmit(row)">
                <t-button variant="text" size="small" theme="primary" :loading="isActing(row, 'submit')">
                  提交审核
                </t-button>
              </t-popconfirm>
            </template>
            <!-- 待审核：审核意见对话框 -->
            <template v-if="row.status === 'pending'">
              <t-button variant="text" size="small" theme="primary" @click="openDialog('approved', row)">
                通过
              </t-button>
              <t-button variant="text" size="small" theme="danger" @click="openDialog('rejected', row)">
                驳回
              </t-button>
            </template>
            <!-- 已发布：下架 -->
            <t-popconfirm
              v-if="row.status === 'published'"
              content="确认下架该文章？下架后成员端不再可见"
              @confirm="onWithdraw(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="isActing(row, 'withdraw')">
                下架
              </t-button>
            </t-popconfirm>
          </div>
        </template>
      </t-table>
    </div>

    <ArticleFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :article="currentArticle"
      @success="load"
    />

    <!-- 审核意见对话框 -->
    <t-dialog
      v-model:visible="dialogVisible"
      :header="dialogAction === 'approved' ? '通过审核' : '驳回文章'"
      width="520px"
      :confirm-btn="{
        content: dialogAction === 'approved' ? '确认发布' : '确认驳回',
        theme: dialogAction === 'approved' ? 'primary' : 'danger',
        loading: submitting,
      }"
      @confirm="onConfirm"
      @close="dialogVisible = false"
    >
      <p v-if="dialogAction === 'approved' && current" class="dialog-tip">
        将发布「{{ current.title }}」，发布时间取当前时刻。
      </p>
      <t-textarea
        v-model="comment"
        placeholder="审核意见（驳回时建议填写原因，将展示给作者）"
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
    </t-dialog>
  </div>
</template>

<style scoped>
.filter-tail {
  margin-left: auto;
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.dialog-tip {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
