<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon, EditIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ColumnController from '@/components/ColumnController.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import StatusTag from '@/components/StatusTag.vue'
import AnnouncementFormDialog from '@/components/AnnouncementFormDialog.vue'
import { useListQueryState } from '@/utils/listQuery'
import {
  deleteAnnouncement,
  fetchAnnouncements,
  publishAnnouncement,
  toggleAnnouncementPin,
  withdrawAnnouncement,
} from '@/api/announcements'
import type { Announcement, AnnouncementStatus } from '@/types'

/* 首页公告：多条公告管理。「启用」即置顶（沿用 pinned，不加列）——
 * 启用互锁保证全局至多一条开启、允许全关；启用的一条展示在客户端首页搜索栏下方。 */
const loading = ref(false)
const loadError = ref('')
const list = ref<Announcement[]>([])
const total = ref(0)
const acting = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '' as AnnouncementStatus | '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'withdrawn' },
]

const columns = [
  { colKey: 'title', title: '公告标题', cell: 'title', width: 240, resizable: true, ellipsis: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 90, resizable: true, ellipsis: true },
  { colKey: 'enabled', title: '启用', cell: 'enabled', width: 90, resizable: true, ellipsis: true },
  { colKey: 'expireAt', title: '有效期', cell: 'expireAt', width: 190, resizable: true, ellipsis: true },
  { colKey: 'publishedAt', title: '发布时间', cell: 'publishedAt', width: 160, resizable: true, ellipsis: true },
  { colKey: 'link', title: '跳转链接', cell: 'link', width: 180, resizable: true, ellipsis: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 200 },
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
    const res = await fetchAnnouncements({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword.trim() || undefined,
      status: query.status || undefined,
    })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
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

/* ---------- 启用开关（互锁） ---------- */
async function onTogglePin(row: Announcement, next: boolean) {
  acting.value = row.id
  try {
    await toggleAnnouncementPin(row.id)
    MessagePlugin.success(next ? '已启用（已自动关闭其它公告）' : '已关闭，客户端首页不再展示本条')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 有效期已过：客户端首页不再下发（与后端 expireAt > 当前时间 的口径一致） */
function isExpired(expireAt?: string): boolean {
  if (!expireAt) return false
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return expireAt <= now
}

/* ---------- 下架 / 重新发布 / 删除 ---------- */
async function onWithdraw(row: Announcement) {
  acting.value = row.id + ':withdraw'
  try {
    await withdrawAnnouncement(row.id)
    MessagePlugin.success('公告已下架（同时取消启用）')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '下架失败')
  } finally {
    acting.value = ''
  }
}

async function onPublish(row: Announcement) {
  acting.value = row.id + ':publish'
  try {
    await publishAnnouncement(row.id)
    MessagePlugin.success('公告已重新发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '发布失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete(row: Announcement) {
  acting.value = row.id + ':delete'
  try {
    await deleteAnnouncement(row.id)
    MessagePlugin.success(`公告「${row.title}」已删除`)
    /* 归档后当前页可能已空：页码越界时回退一页再加载 */
    if (list.value.length <= 1 && query.page > 1) query.page -= 1
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

/* ---------- 新增 / 编辑弹窗（启用开关只在列表操作，避免编辑态与互锁冲突） ---------- */
const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const current = ref<Announcement | null>(null)

function openCreate() {
  formMode.value = 'create'
  current.value = null
  formVisible.value = true
}

function openEdit(row: Announcement) {
  formMode.value = 'edit'
  current.value = row
  formVisible.value = true
}

/* 列表查询状态与 URL 双向同步（关键词/状态/分页可分享、可前进后退恢复） */
const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="announcement-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader
      title="首页公告"
      description="可维护多条公告，最多启用一条；启用的一条会展示在客户端首页搜索栏下方"
    >
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="contents-announcements"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增公告
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
        @row-click="({ row }: { row: Announcement }) => openEdit(row)"
      >
        <template #title="{ row }">
          <div class="cell-title">{{ row.title }}</div>
          <t-tag class="id-tag-block" size="small" variant="light">{{ row.id }}</t-tag>
        </template>
        <template #status="{ row }">
          <StatusTag entity="announcement" :value="row.status" />
        </template>
        <template #enabled="{ row }">
          <div class="enable-cell" @click.stop>
            <!-- 已下架：启用开关禁用（需先重新发布），点空位无副作用 -->
            <t-tooltip v-if="row.status !== 'published'" content="已下架公告需先重新发布才能启用">
              <t-switch :value="false" disabled />
            </t-tooltip>
            <!-- 未启用：开启前二次确认（switch 受控于 row.pinned，确认后才切换） -->
            <t-popconfirm
              v-else-if="!row.pinned"
              content="启用后将自动关闭其它公告，客户端首页仅展示本条。确认启用？"
              @confirm="onTogglePin(row, true)"
            >
              <t-switch :value="false" :loading="acting === row.id" />
            </t-popconfirm>
            <t-switch
              v-else
              :value="true"
              :loading="acting === row.id"
              @change="() => onTogglePin(row, false)"
            />
          </div>
        </template>
        <template #expireAt="{ row }">
          <div class="expire-cell">
            <span>{{ row.expireAt || '—' }}</span>
            <t-tag v-if="isExpired(row.expireAt)" theme="warning" variant="light" size="small">已过期</t-tag>
          </div>
        </template>
        <template #publishedAt="{ row }">{{ row.publishedAt || '—' }}</template>
        <template #link="{ row }">
          <span v-if="row.link">{{ row.link }}</span>
          <span v-else class="cell-muted">—</span>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="openEdit(row)">
              <template #icon><EditIcon /></template>
              编辑
            </t-button>
            <t-popconfirm
              v-if="row.status === 'published'"
              content="确认下架该公告？下架后客户端首页立即隐藏，且会取消启用。"
              @confirm="onWithdraw(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="acting === row.id + ':withdraw'">
                下架
              </t-button>
            </t-popconfirm>
            <t-button
              v-else
              variant="text"
              size="small"
              theme="primary"
              :loading="acting === row.id + ':publish'"
              @click="onPublish(row)"
            >
              重新发布
            </t-button>
            <!-- 仅已下架公告可删除（后端归档规则同口径） -->
            <t-popconfirm
              v-if="row.status === 'withdrawn'"
              content="确认删除该公告？删除后不可恢复。"
              @confirm="onDelete(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">
                <template #icon><DeleteIcon /></template>
                删除
              </t-button>
            </t-popconfirm>
          </div>
        </template>
        <template #empty>
          <ListEmptyState :query="query" description="暂无公告" @clear="onReset" />
        </template>
      </t-table>
    </div>

    <AnnouncementFormDialog
      v-model:visible="formVisible"
      :mode="formMode"
      :announcement="current"
      @saved="load"
    />
  </div>
</template>

<style scoped>
/* 本页标题需要单行省略，其余（字号/字重/主色）由全局 .cell-title 提供 */
.cell-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-muted {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.enable-cell,
.expire-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
  white-space: nowrap;
}
</style>