<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { SearchIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ColumnController from '@/components/ColumnController.vue'
import { fetchIndividuals } from '@/api/individuals'
import ListErrorState from '@/components/ListErrorState.vue'
import { exportCsv, statusLabel } from '@/utils/exportCsv'
import type { User, UserIdentity } from '@/types'

const router = useRouter()
const loading = ref(true)
const loadError = ref('')
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
  { colKey: 'user', title: '成员', cell: 'user', width: 190 , ellipsis: true},
  { colKey: 'level', title: '个体等级', cell: 'level', width: 90 , ellipsis: true},
  { colKey: 'others', title: '其他关联身份', cell: 'others' , ellipsis: true},
  { colKey: 'points', title: '积分', width: 85 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 95 , ellipsis: true},
  { colKey: 'registeredAt', title: '注册时间', width: 115 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 90 },
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
    const res = await fetchIndividuals({ ...query })
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

/* 导出当前页社区个体列表为 CSV */
function onExport() {
  exportCsv(
    '社区个体列表',
    ['编号', '昵称', '联系电话', '个体等级', '积分', '状态', '注册时间'],
    list.value.map((u) => [
      u.uid,
      `${u.nickname} [${u.uid}]`,
      u.phone,
      individualLevel(u),
      u.points,
      statusLabel('user', u.status),
      u.registeredAt,
    ]),
  )
  MessagePlugin.success(`已导出当前页 ${list.value.length} 条数据`)
}

const { syncQuery } = useListQueryState(query, load)

onMounted(load)
</script>

<template>
  <div class="individual-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <PageHeader title="社区个体" description="持有社区个体身份的成员（该身份每人至多一个）">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="individuals"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" @click="onExport">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索姓名/ID/联系电话…"
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
        :columns="visibleColumns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无社区个体"
        @page-change="onPageChange"
        @row-click="({ row }: { row: User }) => goDetail(row)"
      >
        <template #user="{ row }">
          <div class="user-cell">
            <t-avatar size="36px">{{ row.nickname.slice(0, 1) }}</t-avatar>
            <div class="user-cell-info">
              <span class="user-name">{{ row.nickname }}</span>
              <t-tag class="id-tag-block" size="small" variant="light">{{ row.uid }}</t-tag>
            </div>
          </div>
        </template>

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

.muted-dash {
  color: var(--td-text-color-placeholder);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
