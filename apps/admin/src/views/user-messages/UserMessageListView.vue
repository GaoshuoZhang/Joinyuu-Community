<script setup lang="ts">
import { collectAllPages, executeBulk } from '@/utils/bulkOperation'
import { computed, onMounted, ref } from 'vue'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import ColumnController from '@/components/ColumnController.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useListQueryState } from '@/utils/listQuery'
import {
  archiveUserMessage,
  fetchUserMessages,
  replyUserMessage,
  type UserMessageRow,
} from '@/api/userMessages'

/* 用户留言：查看客户端提交的留言并回复；回复后向留言人推送站内信，客户端在「我的 > 我的留言」查看。
 * 已回复留言可归档（单条或一键），归档对象在「归档管理 > 用户留言」恢复或彻底删除。 */

const status = ref('')
const keyword = ref('')
const page = ref(1)
const loading = ref(false)
const loadError = ref('')
const total = ref(0)
const rows = ref<UserMessageRow[]>([])
const visible = ref(false)
const submitting = ref(false)
const currentRow = ref<UserMessageRow | null>(null)
const replyContent = ref('')
/* 回复表单 ref：confirm 时走 validate() 获得字段级错误定位（原 rules 声明此前是死配置） */
const replyFormRef = ref()

/* 排序：默认不指定（后端按「待回复置顶 + 提交时间倒序」），点击表头后按提交时间正/倒序 */
const sortBy = ref<'' | 'createdAt'>('')
const sortOrder = ref<'ascend' | 'descend'>('descend')

const allColumns = [
  { colKey: 'title', title: '留言主题', width: 200 },
  { colKey: 'user', title: '留言人', width: 170 },
  { colKey: 'content', title: '留言内容', width: 300 },
  {
    colKey: 'createdAt',
    title: '提交时间',
    width: 170,
    resizable: true,
    sorter: true,
    sortType: 'all',
  },
  { colKey: 'status', title: '状态', width: 100 },
  { colKey: 'reply', title: '回复内容', width: 260 },
  { colKey: 'op', fixed: 'right' as const, title: '操作', width: 150 },
]
const visibleKeys = ref<string[]>(allColumns.map(column => column.colKey))
const columns = computed(() =>
  visibleKeys.value.map(key => allColumns.find(column => column.colKey === key)!).filter(Boolean),
)
const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待回复' },
  { value: 'replied', label: '已回复' },
]
const { syncQuery } = useListQueryState({}, load, { refs: { status, keyword, page, sortBy, sortOrder } })
let version = 0

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy?: string; descending: boolean }) {
  if (sort.sortBy !== 'createdAt') return
  sortBy.value = 'createdAt'
  sortOrder.value = sort.descending ? 'descend' : 'ascend'
  page.value = 1
  load()
}

const tableSort = computed(() => ({
  sortBy: sortBy.value,
  descending: sortOrder.value === 'descend',
}))

async function load() {
  const current = ++version
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchUserMessages({
      page: page.value,
      pageSize: 20,
      status: status.value,
      keyword: keyword.value.trim(),
      sortBy: sortBy.value || undefined,
      sortOrder: sortBy.value ? sortOrder.value : undefined,
    })
    if (current === version) {
      rows.value = result.list
      total.value = result.total
    }
  } catch (error) {
    if (current === version) loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    if (current === version) loading.value = false
  }
}

/* 空态筛选判定：状态或关键词非空时提示「清除筛选」 */
const filterState = computed(() => ({ status: status.value, keyword: keyword.value }))
function onClearFilter() {
  status.value = ''
  keyword.value = ''
  page.value = 1
  load()
}

function openReply(row: UserMessageRow) {
  currentRow.value = row
  replyContent.value = ''
  visible.value = true
}

async function submitReply() {
  const row = currentRow.value
  if (!row || row.status !== 'pending' || submitting.value) return
  /* 以表单 validate 为主：失败时错误定位在表单项下方，直接 return */
  const result = replyFormRef.value ? await replyFormRef.value.validate() : true
  if (result !== true) return focusFirstInvalid(replyFormRef.value)
  /* 兜底：ref 不可用时仍拦截空内容提交 */
  if (!replyContent.value.trim()) return void MessagePlugin.warning('请填写回复内容')
  submitting.value = true
  try {
    await replyUserMessage(row.id, replyContent.value.trim())
    visible.value = false
    MessagePlugin.success('回复已发送')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '回复失败')
  } finally {
    submitting.value = false
  }
}

/* 归档：仅已回复可归档（可在归档管理中恢复） */
const acting = ref('')
async function onArchive(row: UserMessageRow) {
  acting.value = row.id
  try {
    await archiveUserMessage(row.id)
    MessagePlugin.success('留言已归档')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '归档失败')
  } finally {
    acting.value = ''
  }
}

/* 一键归档：按当前筛选全量拉取，归档所选状态的留言 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
let bulkScope = { status: status.value, keyword: keyword.value.trim() }
const bulkProgress = ref<{ done: number; total: number; failed: number } | null>(null)
let bulkCancelled = false
function onBulkCancel() { bulkCancelled = true }
const bulkStatuses = [{ label: '已回复', value: 'replied' }]

async function doBulkArchive(values: string[]) {
  bulkCancelled = false
  bulkProgress.value = { done: 0, total: 0, failed: 0 }
  try {
    const targets = await collectAllPages<UserMessageRow>(
      (page, pageSize) => fetchUserMessages({ ...bulkScope, page, pageSize }), () => bulkCancelled,
    )
    const pending = targets.filter((row) => values.includes(row.status))
    if (!pending.length) {
      MessagePlugin.info(bulkCancelled ? '已取消，未执行归档' : '当前筛选范围内没有符合所选状态的记录')
      return
    }
    const result = await executeBulk(pending, (row) => archiveUserMessage(row.id), () => bulkCancelled,
      (progress) => { bulkProgress.value = progress })
    if (bulkCancelled) MessagePlugin.warning(`已取消，本次已归档 ${result.done - result.failed} 条留言`)
    else if (result.done > result.failed) MessagePlugin.success(`已归档 ${result.done - result.failed} 条留言`)
    if (result.failed) MessagePlugin.warning(`${result.failed} 条归档失败，请刷新后重试`)
    await load()
  } finally {
    bulkProgress.value = null
  }
}

function countByStatus(status: string) {
  if (bulkScope.status && bulkScope.status !== status) return Promise.resolve(0)
  return fetchUserMessages({ ...bulkScope, status, page: 1, pageSize: 1 }).then((result) => result.total)
}

function onBulkArchive() {
  bulkScope = { status: status.value, keyword: keyword.value.trim() }
  bulkVisible.value = true
}

async function onBulkConfirm(values: string[]) {
  archivingAll.value = true
  try {
    await doBulkArchive(values)
    bulkVisible.value = false
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '一键归档失败')
  } finally {
    archivingAll.value = false
  }
}

onMounted(load)
const { close: closeReplyDialog } = useDialogFormProtection(() => replyContent.value, visible, submitting)
</script>

<template>
  <div class="page-fade-in">
    <PageHeader title="用户留言" description="查看客户端提交的留言并回复；回复后系统会向留言人推送站内信">
      <template #actions>
        <ColumnController
          v-model="visibleKeys"
          storage-key="user-messages"
          :columns="allColumns.map((column) => ({ key: column.colKey, title: column.title }))"
        />
        <t-button variant="outline" :loading="archivingAll" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-accessible-field="'搜索留言'"
        v-model="keyword"
        class="ctl-w-xl"
        clearable
        aria-label="搜索留言"
        placeholder="搜索留言主题 / 内容 / 用户 UID…"
        @enter="page = 1; load()"
        @clear="page = 1; load()"
      />
      <t-select v-accessible-field="'状态筛选'" class="ctl-w-md" v-model="status" :options="statusOptions" label="状态" aria-label="状态筛选" @change="page = 1; load()" />
      <t-button theme="primary" @click="page = 1; load()">查询</t-button>
    </div>

    <!-- 持久错误提示置于卡片外（与列表页统一：卡内只放筛选后的表格） -->
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <div v-else class="page-card">
      <t-table :horizontal-scroll-affixed-bottom="{ container: '.page-scroll', offsetBottom: 0 }"
        row-key="id"
        :data="rows"
        :columns="columns"
        :sort="tableSort"
        :loading="loading"
        table-layout="fixed"
        hover
        resizable
        :pagination="{ current: page, pageSize: 20, total, showPageSize: false }"
        @page-change="(value: { current: number }) => { page = value.current; load() }"
        @sort-change="onSortChange"
      >
        <template #title="{ row }">
          <span>{{ row.title }}</span>
          <t-tag class="id-tag-block" size="small" variant="light">{{ row.id }}</t-tag>
        </template>
        <template #user="{ row }">
          <span>{{ row.userName }}</span>
          <t-tag class="id-tag-block" size="small" variant="light">{{ row.userId }}</t-tag>
          <p v-if="row.userPhone" class="field-help">{{ row.userPhone }}</p>
        </template>
        <template #content="{ row }">
          <t-tooltip :content="row.content" placement="top-left">
            <span class="cell-ellipsis">{{ row.content }}</span>
          </t-tooltip>
        </template>
        <template #status="{ row }"><StatusTag entity="userMessage" :value="row.status" /></template>
        <template #reply="{ row }">
          <template v-if="row.replyContent">
            <t-tooltip :content="row.replyContent" placement="top-left">
              <span class="cell-ellipsis">{{ row.replyContent }}</span>
            </t-tooltip>
            <p class="field-help">{{ row.repliedBy || '社区管理员' }} · {{ row.repliedAt }}</p>
          </template>
          <span v-else>—</span>
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button v-if="row.status === 'pending'" variant="text" theme="primary" @click="openReply(row)">回复</t-button>
            <t-button v-else variant="text" @click="openReply(row)">查看</t-button>
            <t-popconfirm
              v-if="row.status === 'replied'"
              content="确认归档该留言？归档后可在「归档管理」中恢复"
              confirm-btn="归档"
              @confirm="onArchive(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="acting === row.id">归档</t-button>
            </t-popconfirm>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="filterState" description="暂无用户留言" @clear="onClearFilter" />
        </template>
      </t-table>
    </div>

    <t-dialog
      :visible="visible" @close="closeReplyDialog"
      :header="`留言详情 · ${currentRow?.userName ?? ''}`"
      :confirm-btn="currentRow?.status === 'pending' ? { content: '发送回复', loading: submitting } : null"
      :cancel-btn="currentRow?.status === 'pending' ? { content: '取消' } : { content: '关闭' }"
      @confirm="submitReply"
    >
      <div v-if="currentRow" class="message-detail">
        <t-descriptions :column="1" bordered>
          <t-descriptions-item label="留言主题">{{ currentRow.title }}</t-descriptions-item>
          <t-descriptions-item label="留言人">
            {{ currentRow.userName }}（{{ currentRow.userId }}）
            <span v-if="currentRow.userPhone"> · {{ currentRow.userPhone }}</span>
          </t-descriptions-item>
          <t-descriptions-item label="提交时间">{{ currentRow.createdAt }}</t-descriptions-item>
          <t-descriptions-item label="留言内容">
            <p class="message-content">{{ currentRow.content }}</p>
          </t-descriptions-item>
          <t-descriptions-item v-if="currentRow.replyContent" label="已有回复">
            <p class="message-content">{{ currentRow.replyContent }}</p>
            <p class="field-help">{{ currentRow.repliedBy || '社区管理员' }} · {{ currentRow.repliedAt }}</p>
          </t-descriptions-item>
        </t-descriptions>
        <t-form v-if="currentRow.status === 'pending'" ref="replyFormRef" :data="{ replyContent }" label-align="top">
          <t-form-item label="回复内容" name="replyContent" :rules="[{ required: true, message: '请填写回复内容', trigger: 'submit' }]">
            <t-textarea v-accessible-field v-model="replyContent" :maxlength="1000" :autosize="{ minRows: 4, maxRows: 8 }" placeholder="填写回复内容，发送后留言人将收到站内信…" />
          </t-form-item>
        </t-form>
      </div>
    </t-dialog>

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 用户留言"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      @confirm="onBulkConfirm"

      :progress="bulkProgress"
      :count-for-status="countByStatus"
      @cancel="onBulkCancel"
    />
  </div>
</template>

<style scoped>
.message-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-content {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.cell-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
