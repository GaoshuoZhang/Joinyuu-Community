<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SearchIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import { fetchEnterprises } from '@/api/enterprises'
import type { Enterprise } from '@/types'

const router = useRouter()
const loading = ref(false)
const list = ref<Enterprise[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  industry: '',
  status: '',
})

const industryOptions = [
  { label: '全部', value: '' },
  ...['人工智能', '芯片半导体', '文化创意', '企业服务 SaaS', '新材料', '智慧交通', '设计服务', '商业航天', '医疗健康'].map(
    (label) => ({ label, value: label }),
  ),
]

const statusOptions = [
  { label: '全部', value: '' },
  { label: '已入驻', value: 'active' },
  { label: '入驻审核中', value: 'pending' },
  { label: '已退出', value: 'exited' },
]

const columns = [
  { colKey: 'name', title: '企业', cell: 'name', width: 230 },
  { colKey: 'size', title: '规模', width: 110 },
  { colKey: 'leaseType', title: '入驻类型', width: 120 },
  { colKey: 'settledAt', title: '入驻时间', width: 120, cell: 'settledAt' },
  { colKey: 'showcaseStatus', title: '展示页状态', width: 110, cell: 'showcase' },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'op', title: '操作', width: 80, cell: 'op' },
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
    const res = await fetchEnterprises({ ...query })
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
  query.industry = ''
  query.status = ''
  onSearch()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

function goDetail(row: Enterprise) {
  router.push(`/enterprises/${row.id}`)
}

onMounted(load)
</script>

<template>
  <div class="enterprise-list page-fade-in">
    <PageHeader title="社区企业" description="入驻社区的企业信息、成员与展示页管理" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        placeholder="搜索企业名称/ID"
        clearable
        style="width: 220px"
        @enter="onSearch"
      />
      <t-select
        v-model="query.industry"
        label="行业"
        :options="industryOptions"
        clearable
        style="width: 170px"
        @change="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
        <template #icon><RefreshIcon /></template>
        重置
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="auto"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无符合条件的企业"
        @page-change="onPageChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #name="{ row }">
          <div class="ent-cell">
            <t-avatar class="ent-avatar" size="36px">{{ row.name.slice(0, 1) }}</t-avatar>
            <div class="ent-meta">
              <span class="ent-name">{{ row.name }}</span>
              <span class="ent-sub">{{ row.industry }}</span>
            </div>
          </div>
        </template>
        <template #settledAt="{ row }">{{ row.settledAt ?? '—' }}</template>
        <template #showcase="{ row }">
          <StatusTag entity="showcase" :value="row.showcaseStatus" />
        </template>
        <template #status="{ row }">
          <StatusTag entity="enterprise" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.ent-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ent-avatar {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
  border-radius: var(--td-radius-medium);
}

.ent-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ent-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ent-sub {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

:deep(.t-table__row) {
  cursor: pointer;
}

.op-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
