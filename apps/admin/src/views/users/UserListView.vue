<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { SearchIcon, DownloadIcon, AddIcon, BrowseIcon, BrowseOffIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ColumnController from '@/components/ColumnController.vue'
import { userCategoryOptions, identityTypeMap } from '@/constants/identity'
import { fetchUsers } from '@/api/users'
import { exportCsv, statusLabel } from '@/utils/exportCsv'
import ListErrorState from '@/components/ListErrorState.vue'
import UserFormDialog from '@/components/UserFormDialog.vue'
import type { User } from '@/types'

const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<User[]>([])
const total = ref(0)
const formVisible = ref(false)
const phoneVisible = ref(false)

function maskPhone(value?: string | null): string {
  if (!value) return '—'
  if (value.length < 8) return `${value.slice(0, 2)}****${value.slice(-2)}`
  return `${value.slice(0, 3)}****${value.slice(7)}`
}

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
  category: '',
  realStatus: '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '已冻结', value: 'frozen' },
  { label: '已注销', value: 'deleted' },
]

const realStatusOptions = [
  { label: '全部', value: '' },
  { label: '已实名', value: 'verified' },
  { label: '未实名', value: 'unverified' },
]

const columns = [
  { colKey: 'user', title: '用户', cell: 'user', width: 190 , ellipsis: true},
  { colKey: 'phone', title: 'phone-title', cell: 'phone', width: 145 , ellipsis: true},
  { colKey: 'identities', title: '关联身份', cell: 'identities', width: 240 , ellipsis: true},
  { colKey: 'realStatus', title: '实名状态', cell: 'realStatus', width: 95 , ellipsis: true},
  { colKey: 'points', title: '积分', width: 80 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 95 , ellipsis: true},
  { colKey: 'registeredAt', title: '注册时间', width: 110 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 140 },
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
    const res = await fetchUsers({ ...query })
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
  query.category = ''
  query.realStatus = ''
  query.page = 1
  load()
}

/* 导出当前页用户列表为 CSV */
function onExport() {
  exportCsv(
    '用户列表',
    ['编号', '昵称', '联系电话', '关联身份', '实名状态', '积分', '状态', '注册时间'],
    list.value.map((u) => [
      u.uid,
      `${u.nickname} [${u.uid}]`,
      u.phone,
      u.identities
        .filter((i) => i.type !== 'individual')
        .map((i) => identityTypeMap[i.type])
        .join('、'),
      u.realName && u.citizenId ? '已实名' : '未实名',
      u.points,
      statusLabel('user', u.status),
      u.registeredAt,
    ]),
  )
  MessagePlugin.success(`已导出当前页 ${list.value.length} 条数据`)
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 个人用户为注册默认身份，列表「关联身份」不展示 */
function otherIdentities(row: User) {
  return row.identities.filter((i) => i.type !== 'individual')
}

/* 实名状态派生：真实姓名与身份证号均填写 = 已实名 */
function isVerified(row: User) {
  return !!row.realName && !!row.citizenId
}

function goDetail(row: User) {
  router.push(`/users/${row.uid}`)
}

function onCreated(id: string) {
  query.keyword = id
  query.status = ''
  query.category = ''
  query.realStatus = ''
  query.page = 1
  load()
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="user-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <PageHeader title="用户管理" description="社区成员账号与关联身份管理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="users"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.colKey === 'phone' ? '联系电话' : c.title }))"
        />
        <t-button variant="outline" @click="onExport">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
        <t-button theme="primary" v-permission="'/users'" @click="formVisible = true">
          <template #icon><AddIcon /></template>
          新增用户
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索昵称/UID/联系电话…"
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
        style="width: 130px"
        @change="onSearch"
      />
      <t-select
        v-model="query.realStatus"
        label="实名状态"
        :options="realStatusOptions"
        clearable
        style="width: 180px"
        @change="onSearch"
      />
      <t-button theme="primary" variant="outline" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">
        重置
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="uid"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无用户"
        @page-change="onPageChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #phone-title>
          <span class="phone-title">
            联系电话
            <t-button
              variant="text"
              size="small"
              shape="square"
              :title="phoneVisible ? '隐藏联系电话' : '显示联系电话'"
              :aria-label="phoneVisible ? '隐藏联系电话' : '显示联系电话'"
              @click.stop="phoneVisible = !phoneVisible"
            >
              <template #icon><BrowseOffIcon v-if="phoneVisible" /><BrowseIcon v-else /></template>
            </t-button>
          </span>
        </template>

        <template #phone="{ row }">
          {{ phoneVisible ? row.phone : maskPhone(row.phone) }}
        </template>

        <template #user="{ row }">
          <div class="user-cell">
            <t-avatar size="36px" :image="row.avatar">{{ row.nickname.slice(0, 1) }}</t-avatar>
            <div class="user-cell-info">
              <span class="user-name">{{ row.nickname }}</span>
              <t-tag class="id-tag-block" size="small" variant="light">{{ row.uid }}</t-tag>
            </div>
          </div>
        </template>

        <template #identities="{ row }">
          <IdentityTags v-if="otherIdentities(row).length" :identities="otherIdentities(row)" />
          <span v-else class="muted-dash">—</span>
        </template>

        <template #realStatus="{ row }">
          <t-tag v-if="isVerified(row)" theme="success" variant="light" size="small">已实名</t-tag>
          <t-tag v-else theme="default" variant="light" size="small">未实名</t-tag>
        </template>

        <template #status="{ row }">
          <t-tooltip
            v-if="row.status === 'frozen' && (row.frozenReason || row.frozenUntil)"
            :content="[row.frozenUntil ? `冻结至 ${row.frozenUntil}` : '长期冻结', row.frozenReason].filter(Boolean).join(' · ')"
          >
            <StatusTag entity="user" :value="row.status" />
          </t-tooltip>
          <StatusTag v-else entity="user" :value="row.status" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <UserFormDialog v-model:visible="formVisible" @success="onCreated" />
  </div>
</template>

<style scoped>
.phone-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
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
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}
</style>
