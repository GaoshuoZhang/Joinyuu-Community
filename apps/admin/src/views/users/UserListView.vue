<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import { userCategoryOptions } from '@/constants/identity'
import { fetchUsers, updateUserStatus } from '@/api/users'
import type { User } from '@/types'

const router = useRouter()
const loading = ref(true)
const list = ref<User[]>([])
const total = ref(0)
const togglingId = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
  category: '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '待激活', value: 'pending' },
  { label: '已冻结', value: 'frozen' },
]

const columns = [
  { colKey: 'user', title: '用户', cell: 'user', width: 190 },
  { colKey: 'phone', title: '手机号', width: 125 },
  { colKey: 'identities', title: '关联身份', cell: 'identities', width: 260 },
  { colKey: 'points', title: '积分', width: 85 },
  { colKey: 'status', title: '状态', cell: 'status', width: 95 },
  { colKey: 'registeredAt', title: '注册时间', width: 115 },
  { colKey: 'op', title: '操作', cell: 'op', width: 140 },
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
    const res = await fetchUsers({ ...query })
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
  query.category = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 冻结/解冻切换：frozen 显示「解冻」，其余显示「冻结」 */
async function onToggleStatus(row: User) {
  const next = row.status === 'frozen' ? 'active' : 'frozen'
  togglingId.value = row.id
  try {
    await updateUserStatus(row.id, next)
    MessagePlugin.success(next === 'frozen' ? '已冻结该账号' : '已解冻该账号')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    togglingId.value = ''
  }
}

/* 个人用户为注册默认身份，列表「关联身份」不展示 */
function otherIdentities(row: User) {
  return row.identities.filter((i) => i.type !== 'individual')
}

function goDetail(row: User) {
  router.push(`/users/${row.id}`)
}

onMounted(load)
</script>

<template>
  <div class="user-list page-fade-in">
    <PageHeader title="用户管理" description="社区成员账号与关联身份管理" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索姓名/ID/手机号"
        clearable
        @enter="onSearch"
      />
      <t-select
        v-model="query.category"
        label="身份"
        :options="userCategoryOptions"
        clearable
        style="width: 150px"
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
        table-layout="auto"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无符合条件的用户"
        @page-change="onPageChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #user="{ row }">
          <div class="user-cell">
            <t-avatar size="36px">{{ row.name.slice(0, 1) }}</t-avatar>
            <div class="user-cell-info">
              <span class="user-name">{{ row.name }}</span>
              <span class="user-id">{{ row.id }}</span>
            </div>
          </div>
        </template>

        <template #identities="{ row }">
          <IdentityTags v-if="otherIdentities(row).length" :identities="otherIdentities(row)" />
          <span v-else class="muted-dash">—</span>
        </template>

        <template #status="{ row }">
          <StatusTag entity="user" :value="row.status" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-popconfirm
              :content="row.status === 'frozen' ? '确认解冻该账号？' : '确认冻结该账号？'"
              @confirm="onToggleStatus(row)"
            >
              <t-button
                variant="text"
                size="small"
                :theme="row.status === 'frozen' ? 'primary' : 'danger'"
                :loading="togglingId === row.id"
              >
                {{ row.status === 'frozen' ? '解冻' : '冻结' }}
              </t-button>
            </t-popconfirm>
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
