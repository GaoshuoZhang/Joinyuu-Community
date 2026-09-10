<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, PinIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import AnnouncementFormDialog from '@/components/AnnouncementFormDialog.vue'
import {
  deleteAnnouncement,
  fetchAnnouncements,
  publishAnnouncement,
  toggleAnnouncementPin,
  withdrawAnnouncement,
} from '@/api/announcements'
import type { Announcement } from '@/types'

/* 公告栏：站点公告的发布/编辑/下架/置顶管理（创建即发布，客户端公告位仅消费已发布公告） */
const loading = ref(false)
const acting = ref('')
const list = ref<Announcement[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '已发布', value: 'published' },
  { label: '已下架', value: 'withdrawn' },
]

const columns = [
  { colKey: 'title', title: '公告', cell: 'title', minWidth: 300, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'pinned', title: '置顶', cell: 'pinned', width: 90 },
  { colKey: 'publishedAt', title: '发布时间', width: 160, resizable: true },
  { colKey: 'updatedAt', title: '最近编辑', cell: 'updatedAt', width: 160, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 210 },
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
    const res = await fetchAnnouncements({ ...query })
    list.value = res.list
    total.value = res.total
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

/* ---------- 新建 / 编辑 ---------- */
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

/* ---------- 状态与置顶操作 ---------- */
async function onWithdraw(row: Announcement) {
  acting.value = row.id + ':withdraw'
  try {
    await withdrawAnnouncement(row.id)
    MessagePlugin.success('公告已下架，客户端公告位不再展示')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
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
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onTogglePin(row: Announcement) {
  acting.value = row.id + ':pin'
  try {
    await toggleAnnouncementPin(row.id)
    MessagePlugin.success(row.pinned ? '已取消置顶' : '公告已置顶')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete(row: Announcement) {
  acting.value = row.id + ':delete'
  try {
    await deleteAnnouncement(row.id)
    MessagePlugin.success('公告已删除')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="announcements-panel page-fade-in">
    <PageHeader title="公告栏" description="站点公告的发布、置顶与下架管理（客户端公告位仅展示已发布公告）">
      <template #actions>
        <t-button variant="outline" @click="load">
          <template #icon><RefreshIcon /></template>
          刷新
        </t-button>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          发布公告
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        clearable
        placeholder="搜索公告标题/编号"
        style="width: 220px"
        @enter="onSearch"
      />
      <t-select v-model="query.status" label="状态" :options="statusOptions" clearable style="width: 140px" @change="onSearch" />
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
    </div>

    <t-table
      row-key="id"
      table-layout="fixed"
      hover
      resizable
      :data="list"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      empty="暂无公告"
      @page-change="onPageChange"
    >
      <template #title="{ row }">
        <div class="cell-title">
          <span class="title-text">{{ row.title }}</span>
          <span class="title-id">{{ row.id }}</span>
        </div>
      </template>
      <template #status="{ row }">
        <StatusTag entity="announcement" :value="row.status" />
      </template>
      <template #pinned="{ row }">
        <t-tag v-if="row.pinned" theme="warning" variant="light" size="small">
          <template #icon><PinIcon /></template>
          置顶
        </t-tag>
        <span v-else class="pin-none">—</span>
      </template>
      <template #updatedAt="{ row }">{{ row.updatedAt ?? '—' }}</template>
      <template #op="{ row }">
        <div class="op-cell" @click.stop>
          <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
          <t-button v-if="row.status === 'published'" variant="text" size="small" @click="onTogglePin(row)">
            {{ row.pinned ? '取消置顶' : '置顶' }}
          </t-button>
          <t-popconfirm v-if="row.status === 'published'" content="确认下架该公告？下架后客户端公告位立即隐藏。" @confirm="onWithdraw(row)">
            <t-button variant="text" size="small" theme="warning" :loading="acting === row.id + ':withdraw'">下架</t-button>
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
          <t-popconfirm content="确认删除该公告？删除后不可恢复。" @confirm="onDelete(row)">
            <t-button variant="text" size="small" theme="danger" :loading="acting === row.id + ':delete'">删除</t-button>
          </t-popconfirm>
        </div>
      </template>
    </t-table>

    <AnnouncementFormDialog v-model:visible="formVisible" :mode="formMode" :announcement="current" @success="load" />
  </div>
</template>

<style scoped>
.cell-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.title-text {
  font-weight: 500;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-id {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.pin-none {
  color: var(--td-text-color-placeholder);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}
</style>
