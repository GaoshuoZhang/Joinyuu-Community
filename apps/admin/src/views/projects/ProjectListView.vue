<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AddIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import { fetchProjects } from '@/api/projects'
import { fetchEnterprise } from '@/api/enterprises'
import { fetchExternalEnterprise } from '@/api/external-enterprises'
import { fetchUser } from '@/api/users'
import type { Project } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const list = ref<Project[]>([])
const total = ref(0)
/* 用户详情「数据概览」跳转带入的参与人筛选 */
const participantName = ref('')
/* 企业详情「数据概览」跳转带入的企业筛选（值为社区企业 ID 或外部企业 ID，标签显示名称） */
const enterpriseName = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
  participant: '',
  enterprise: '',
})

/* 排序：默认立项日期倒序（最新立项在前），支持立项日期正/倒序 */
const sortBy = ref<'initiatedAt' | 'id'>('initiatedAt')
const sortOrder = ref<'ascend' | 'descend'>('descend')

const statusOptions = [
  { label: '全部', value: '' },
  { label: '招募中', value: 'recruiting' },
  { label: '进行中', value: 'running' },
  { label: '已暂停', value: 'paused' },
  { label: '已结项', value: 'finished' },
]

const columns = [
  { colKey: 'name', title: '项目', cell: 'name', minWidth: 200, resizable: true },
  { colKey: 'undertakers', title: '承接方', cell: 'undertakers', minWidth: 240, resizable: true },
  {
    colKey: 'initiatedAt',
    title: '立项日期',
    width: 120,
    resizable: true,
    sorter: true,
    sortType: 'all',
  },
  { colKey: 'memberCount', title: '成员数', width: 84, resizable: true },
  { colKey: 'progress', title: '进度', cell: 'progress', width: 150, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 96, resizable: true },
  { colKey: 'duration', title: '起止时间', cell: 'duration', width: 190, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 72 },
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
    const res = await fetchProjects({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
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
  query.status = ''
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

/* 创建项目 */
const createVisible = ref(false)

function goDetail(row: Project) {
  router.push(`/projects/${row.id}`)
}

function onRowClick({ row }: { row: Project }) {
  goDetail(row)
}

/* 用户详情「数据概览」跳转带入参与人 ID（query: participant），按 ID 过滤避免同名歧义；
 * 企业详情「数据概览」跳转带入企业 ID（query: enterprise，社区企业 E* / 外部企业 XE*），
 * 标签显示名称：社区企业经 fetchEnterprise、外部企业经 fetchExternalEnterprise 由 ID 解析 */
async function applyRouteFilter() {
  query.participant = (route.query.participant as string) || ''
  query.enterprise = (route.query.enterprise as string) || ''
  participantName.value = ''
  enterpriseName.value = ''
  if (query.participant) {
    try {
      const u = await fetchUser(query.participant)
      participantName.value = u.name
    } catch {
      /* 用户不存在时标签回退显示 ID */
    }
  }
  if (query.enterprise) {
    try {
      const res = await fetchEnterprise(query.enterprise)
      enterpriseName.value = res.enterprise.name
    } catch {
      /* 非社区企业 ID：尝试按外部企业 ID 解析名称 */
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

watch(
  () => route.query,
  () => {
    applyRouteFilter()
    load()
  },
)

onMounted(() => {
  applyRouteFilter()
  load()
})
</script>

<template>
  <div class="project-list page-fade-in">
    <PageHeader title="项目管理" description="跨企业协作项目的创建、承接方与进度管理">
      <template #actions>
        <t-button theme="primary" @click="createVisible = true">
          <template #icon><AddIcon /></template>
          创建项目
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索项目名称/编号"
        clearable
        style="width: 220px"
        @enter="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 160px"
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
      <t-table
        row-key="id"
        table-layout="auto"
        hover
        resizable
        :data="list"
        :columns="columns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
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
              {{ u.name }} {{ u.share }}%
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
          <StatusTag entity="project" :value="row.status" />
        </template>
        <template #duration="{ row }">{{ row.startDate }} ~ {{ row.endDate }}</template>
        <template #op="{ row }">
          <t-button variant="text" @click.stop="goDetail(row)">详情</t-button>
        </template>
        <template #empty>
          <t-empty description="暂无项目数据" />
        </template>
      </t-table>
    </div>

    <!-- 创建项目弹窗 -->
    <ProjectFormDialog v-model:visible="createVisible" :demand="null" @success="load" />
  </div>
</template>

<style scoped>
.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
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
</style>
