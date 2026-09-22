<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { SearchIcon, AddIcon, BrowseIcon, BrowseOffIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ExportButton from '@/components/ExportButton.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import ColumnController from '@/components/ColumnController.vue'
import { userCategoryOptions, identityTypeMap } from '@/constants/identity'
import { fetchUsers } from '@/api/users'
import { statusLabel } from '@/utils/exportCsv'
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

/* 邮箱脱敏口径与用户详情页一致（保留本地部分前 2 位与域名），同一份数据的列表/详情/导出口径统一 */
function maskEmail(value?: string | null): string {
  if (!value) return '—'
  const at = value.indexOf('@')
  if (at <= 0) return `${value.slice(0, 2)}***`
  const local = value.slice(0, at)
  return `${local.slice(0, Math.min(2, local.length))}***${value.slice(at)}`
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
  { colKey: 'username', title: '用户名', cell: 'username', width: 150 , ellipsis: true},
  /* 联系方式为手机号 + 邮箱双行，宽度需容纳完整邮箱（约 12px 字号 24 字符） */
  { colKey: 'phone', title: 'phone-title', cell: 'phone', width: 200, ellipsis: true},
  { colKey: 'identities', title: '关联身份', cell: 'identities', width: 240 , ellipsis: true},
  { colKey: 'realStatus', title: '实名状态', cell: 'realStatus', width: 95 , ellipsis: true},
  { colKey: 'points', title: '积分', width: 80 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 95 , ellipsis: true},
  { colKey: 'registeredAt', title: '注册时间', width: 110 , ellipsis: true},
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

/* 请求序号守卫：仅最后一次请求可写回状态，避免快速切页/改筛选时的竞态覆盖 */
let version = 0
async function load() {
  const current = ++version
  syncQuery()
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchUsers({ ...query })
    if (current === version) {
      list.value = res.list
      total.value = res.total
    }
  } catch (e) {
    if (current === version) loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    if (current === version) loading.value = false
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

/* 导出配置：与列表「联系方式」同口径——手机号 + 邮箱，未点「显示联系方式」时导出遮罩值 */
const exportHeaders = ['编号', '用户名', '昵称', '联系方式', '关联身份', '实名状态', '积分', '状态', '注册时间']

/* 联系方式列：手机号与邮箱以 “ / ” 合并为一格（CSV 单列无法承载双行），任一为空只导出另一项 */
function contactText(u: User): string {
  const phone = phoneVisible.value ? u.phone : maskPhone(u.phone)
  const email = phoneVisible.value ? u.email : maskEmail(u.email)
  return [phone, email].filter((v) => v && v !== '—').join(' / ') || '—'
}

function mapRow(u: User): (string | number)[] {
  return [
    u.uid,
    u.username,
    `${u.nickname} [${u.uid}]`,
    contactText(u),
    u.identities
      .filter((i) => i.type !== 'individual')
      .map((i) => identityTypeMap[i.type])
      .join('、'),
    u.realName && u.citizenId ? '已实名' : '未实名',
    u.points,
    statusLabel('user', u.status),
    u.registeredAt,
  ]
}

const pageExportRows = computed(() => list.value.map(mapRow))

function fetchAllForExport(page: number, pageSize: number) {
  return fetchUsers({ ...query, page, pageSize })
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
          :columns="columns.map((c) => ({ key: c.colKey, title: c.colKey === 'phone' ? '联系方式' : c.title }))"
        />
        <ExportButton
          filename="用户列表"
          :headers="exportHeaders"
          :rows="pageExportRows"
          :fetch-all="fetchAllForExport"
          :map-row="mapRow"
        />
        <t-button theme="primary" v-permission="'/users'" @click="formVisible = true">
          <template #icon><AddIcon /></template>
          新增用户
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="ctl-w-xl"
        placeholder="搜索用户名/昵称/UID/联系电话…"
        clearable
        @enter="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.category"
        label="身份"
        :options="userCategoryOptions"
        clearable
        @change="onSearch"
      />
      <t-select class="ctl-w-md"
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        @change="onSearch"
      />
      <t-select class="ctl-w-lg"
        v-model="query.realStatus"
        label="实名状态"
        :options="realStatusOptions"
        clearable
        @change="onSearch"
      />
      <t-button @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">
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
        :row-attributes="{ style: { cursor: 'pointer' } }"
        @page-change="onPageChange"
        @row-click="({ row }: { row: User }) => goDetail(row)"
      >
        <template #phone-title>
          <span class="phone-title">
            联系方式
            <t-button
              variant="text"
              size="small"
              shape="square"
              :title="phoneVisible ? '隐藏联系方式' : '显示联系方式'"
              :aria-label="phoneVisible ? '隐藏联系方式' : '显示联系方式'"
              @click.stop="phoneVisible = !phoneVisible"
            >
              <template #icon><BrowseOffIcon v-if="phoneVisible" /><BrowseIcon v-else /></template>
            </t-button>
          </span>
        </template>

        <!-- 双行：手机号 + 邮箱，共用同一可见性开关（隐藏时各自脱敏） -->
        <template #phone="{ row }">
          <div class="contact-cell">
            <span class="contact-line">{{ phoneVisible ? (row.phone || '—') : maskPhone(row.phone) }}</span>
            <span class="contact-line contact-mail">{{ phoneVisible ? (row.email || '—') : maskEmail(row.email) }}</span>
          </div>
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

        <template #username="{ row }">
          <span v-if="row.username">{{ row.username }}</span>
          <span v-else class="muted-dash">—</span>
        </template>

        <template #identities="{ row }">
          <IdentityTags v-if="otherIdentities(row).length" :identities="otherIdentities(row)" />
          <span v-else class="muted-dash">—</span>
        </template>

        <template #realStatus="{ row }">
          <StatusTag entity="verified" :value="isVerified(row) ? 'verified' : 'unverified'" />
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

        <template #empty>
          <ListEmptyState :query="query" description="暂无用户" @clear="onReset" />
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

/* 联系方式双行：裁剪交给 TDesign 的省略号容器（nowrap + overflow:hidden），
 * 双行内容不逐行裁剪，超长时仍由该容器判定溢出并悬浮展示完整值（与申请审核页双行单元格同一写法） */
.contact-cell {
  display: flex;
  flex-direction: column;
}

.contact-line {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

/* 邮箱为次要联系方式：降一级字号与字色，两行仍属同一字段 */
.contact-mail {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
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
  gap: 8px;
}
</style>
