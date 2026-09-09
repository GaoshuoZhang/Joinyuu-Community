<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import { fetchIndividuals } from '@/api/individuals'
import type { User, UserIdentity } from '@/types'

const router = useRouter()
const loading = ref(true)
const list = ref<User[]>([])
const total = ref(0)

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '已冻结', value: 'frozen' },
]

const columns = [
  { colKey: 'user', title: '成员', cell: 'user', width: 190 },
  { colKey: 'title', title: '社区个体头衔', cell: 'title', width: 200 },
  { colKey: 'level', title: '经验等级', cell: 'level', width: 90 },
  { colKey: 'others', title: '其他关联身份', cell: 'others' },
  { colKey: 'points', title: '积分', width: 85 },
  { colKey: 'status', title: '状态', cell: 'status', width: 95 },
  { colKey: 'registeredAt', title: '注册时间', width: 115 },
  { colKey: 'op', title: '操作', cell: 'op', width: 90 },
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
    const res = await fetchIndividuals({ ...query })
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

function individualTitle(row: User): string {
  return row.identities.find((i) => i.type === 'community_individual')?.title ?? '—'
}

function individualLevel(row: User): string {
  const level = row.identities.find((i) => i.type === 'community_individual')?.level
  return level ? `${level} 级` : '—'
}

function otherIdentities(row: User): UserIdentity[] {
  /* 个人用户为注册默认身份，不在此展示 */
  return row.identities.filter((i) => i.type !== 'community_individual' && i.type !== 'individual')
}

function goDetail(row: User) {
  router.push(`/users/${row.uid}`)
}

onMounted(load)
</script>

<template>
  <div class="individual-list page-fade-in">
    <PageHeader title="社区个体" description="持有社区个体身份的成员（该身份每人至多一个）" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索姓名/ID/手机号"
        clearable
        @enter="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-button theme="primary" variant="outline" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">
        <template #icon><RefreshIcon /></template>
        重置
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
        empty="暂无符合条件的社区个体"
        @page-change="onPageChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #user="{ row }">
          <div class="user-cell">
            <t-avatar size="36px">{{ row.nickname.slice(0, 1) }}</t-avatar>
            <div class="user-cell-info">
              <span class="user-name">{{ row.nickname }}</span>
              <span class="user-id">{{ row.uid }}</span>
            </div>
          </div>
        </template>

        <template #title="{ row }">{{ individualTitle(row) }}</template>

        <template #level="{ row }">{{ individualLevel(row) }}</template>

        <template #others="{ row }">
          <IdentityTags v-if="otherIdentities(row).length" :identities="otherIdentities(row)" />
          <span v-else class="muted-dash">—</span>
        </template>

        <template #status="{ row }">
          <StatusTag entity="user" :value="row.status" />
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
.filter-keyword {
  width: 240px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-cell-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.user-id {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
