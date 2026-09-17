<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { useListQueryState } from '@/utils/listQuery'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, SearchIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ColumnController from '@/components/ColumnController.vue'
import BulkArchiveDialog from '@/components/BulkArchiveDialog.vue'
import DemandPublishDialog from '@/components/DemandPublishDialog.vue'
import DemandReviewDialog from '@/components/DemandReviewDialog.vue'
import DemandScheduleDialog from '@/components/DemandScheduleDialog.vue'
import ContentTakedownDialog from '@/components/ContentTakedownDialog.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import { archiveDemand, cancelDemandSchedule, closeDemand, fetchDemands, publishDemandNow, proxyRespondDemand, fetchPublisherOptions } from '@/api/demands'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { exportAllRows, exportCsv, statusLabel } from '@/utils/exportCsv'
import { fetchPointsRules } from '@/api/mall'
import { fetchEnterprise } from '@/api/enterprises'
import { fetchExternalEnterprise } from '@/api/external-enterprises'
import { fetchUser } from '@/api/users'
import type { Demand, UserIdentity } from '@/types'

/* 发布方身份兜底：历史数据无快照时按编号前缀推导（E→社区企业 / XE→合作企业 / U→仅个人用户标「个人用户」） */
/* 需求方标签映射：
 * 企业 → 社区企业/合作企业；社区个体 → 社区个体；仅个人用户 → 个人用户；自定义 → 未录入 */
function publisherTagOf(row: Demand): { text: string; theme: 'default' | 'primary'; variant: 'light' | 'outline' } | null {
  const id = publisherIdentityOf(row)
  if (id) {
    if (id.type === 'community_enterprise') return { text: '社区企业', theme: 'primary', variant: 'light' }
    if (id.type === 'external_enterprise') return { text: '合作企业', theme: 'default', variant: 'outline' }
    if (id.type === 'community_individual') return { text: '社区个体', theme: 'primary', variant: 'light' }
    return { text: '个人用户', theme: 'default', variant: 'light' }
  }
  /* 无身份快照：注册个人（U 前缀）兜底个人用户；其余（自定义/未注册）→ 未录入 */
  if (row.publisherId && !row.publisherId.startsWith('custom')) {
    return { text: '个人用户', theme: 'default', variant: 'light' }
  }
  return { text: '未录入', theme: 'default', variant: 'outline' }
}

/* 需求方显示名：企业=企业名；个人/社区个体=昵称（即真实姓名）；自定义=联系人 */
function publisherNameOf(row: Demand): string {
  if (!row.publisherId) return row.contactName || row.publisherName || '—'
  return row.publisherName || '—'
}
function publisherIdentityOf(row: Demand): UserIdentity | null {
  if (row.publisherIdentity) return row.publisherIdentity
  if (!row.publisherId) return null
  if (row.publisherId.startsWith('E')) {
    return { type: 'community_enterprise', enterpriseId: row.publisherId, enterpriseName: row.publisherName, title: '社区企业成员' } as UserIdentity
  }
  if (row.publisherId.startsWith('XE')) {
    return { type: 'external_enterprise', enterpriseName: row.publisherName, title: '合作企业' } as UserIdentity
  }
  return null
}
/* 积分规则默认分值：需求未自定义时展示规则配置值 */
const rulePoints = ref({ respond: 20 })

onMounted(async () => {
  try {
    const rules = await fetchPointsRules()
    rulePoints.value.respond = rules.find((r) => r.code === 'demand_responded')?.points ?? 20
  } catch {
    /* 规则加载失败时保留默认值 */
  }
})

/* 响应积分标签配色：与积分规则默认值比较 —— 相等绿色、低于红色、高于橙色 */
function respondPointsTheme(row: Demand): 'success' | 'danger' | 'warning' {
  const value = row.respondPoints ?? rulePoints.value.respond
  if (value === rulePoints.value.respond) return 'success'
  return value < rulePoints.value.respond ? 'danger' : 'warning'
}

/* 代报名弹窗：管理员代成员响应需求（published / projected 可用）。
 * 报名方选择器 = 注册个人用户/企业 + 未注册自建（creatable），选中已注册自动填充联系电话 */
const proxyVisible = ref(false)
const proxyTarget = ref<Demand | null>(null)
const proxySaving = ref(false)
const proxyFormRef = ref()
const proxyForm = reactive({
  memberValue: '',
  phone: '',
  email: '',
  quote: '',
  message: '',
})

/* 规则 trigger 一律 submit：确认时 validate 才红框提示；required 自动显示红色 * */
const proxyRules: FormProps['rules'] = {
  memberValue: [{ required: true, message: '请选择或输入报名方', trigger: 'submit' }],
  phone: [{ required: true, message: '请填写联系电话', trigger: 'submit' }],
}
const userProxyOptions = ref<{ label: string; value: string }[]>([])
const enterpriseProxyOptions = ref<{ label: string; value: string }[]>([])
const proxyOptions = computed(() => [...userProxyOptions.value, ...enterpriseProxyOptions.value])
/* 报名方信息：U:/E: 前缀 = 已注册（自动填充联系电话），其余 = 自建条目 */
const proxyContact = ref<{ userName: string; enterprise: string; phone: string; email: string } | null>(null)

async function loadProxyOptions() {
  try {
    const opts = await (publisherOptionsCache ? Promise.resolve(publisherOptionsCache) : fetchPublisherOptions().then((o) => (publisherOptionsCache = o)))
    userProxyOptions.value = opts.users.map((u) => ({
      label: u.nickname + '\uff08' + u.tag + ' · ' + u.uid + '\uff09',
      value: 'U:' + u.uid,
    }))
    enterpriseProxyOptions.value = opts.enterprises.map((e) => ({
      label: e.name + '\uff08' + e.tag + ' · ' + e.id + '\uff09',
      value: 'E:' + e.id,
    }))
  } catch {
    /* 选项加载失败时下拉为空 */
  }
}

watch(
  () => proxyForm.memberValue,
  (v) => {
    if (v.startsWith('U:')) {
      const u = fetchPublisherOptionsUsers().find((x) => x.uid === v.slice(2))
      proxyContact.value = u
        ? { userName: u.nickname, enterprise: '个人', phone: u.phone, email: u.email }
        : null
    } else if (v.startsWith('E:')) {
      const e = fetchPublisherOptionsEnterprises().find((x) => x.id === v.slice(2))
      proxyContact.value = e
        ? { userName: e.name, enterprise: e.name, phone: e.contactPhone, email: e.contactEmail ?? '' }
        : null
    } else {
      proxyContact.value = v.trim() ? { userName: v.trim(), enterprise: v.trim(), phone: '', email: '' } : null
    }
    proxyForm.phone = proxyContact.value?.phone ?? ''
    proxyForm.email = proxyContact.value?.email ?? ''
  },
)

function openProxy(row: Demand) {
  proxyTarget.value = row
  proxyForm.memberValue = ''
  proxyForm.phone = ''
  proxyForm.email = ''
  proxyForm.quote = ''
  proxyForm.message = ''
  proxyVisible.value = true
  loadProxyOptions()
}

async function onProxyConfirm() {
  if (!proxyTarget.value) return
  const valid = await proxyFormRef.value.validate()
  if (valid !== true) return
  proxySaving.value = true
  try {
    await proxyRespondDemand(proxyTarget.value.id, {
      userName: proxyContact.value?.userName ?? proxyForm.memberValue.trim(),
      enterprise: proxyContact.value?.enterprise ?? proxyForm.memberValue.trim(),
      phone: proxyForm.phone,
      email: proxyForm.email,
      quote: proxyForm.quote,
      message: proxyForm.message,
    })
    MessagePlugin.success(`已代「${proxyContact.value?.userName ?? proxyForm.memberValue}」完成响应报名`)
    proxyVisible.value = false
    await load()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
    MessagePlugin.error(e instanceof Error ? e.message : '代报名失败')
  } finally {
    proxySaving.value = false
  }
}

/* 代报名联系电话自动填充的数据源（fetchPublisherOptions 结果缓存） */
let publisherOptionsCache: { users: { uid: string; nickname: string; phone: string; email: string }[]; enterprises: { id: string; name: string; contactPhone: string; contactEmail?: string }[] } | null = null
function fetchPublisherOptionsUsers() {
  return publisherOptionsCache?.users ?? []
}
function fetchPublisherOptionsEnterprises() {
  return publisherOptionsCache?.enterprises ?? []
}
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const list = ref<Demand[]>([])
const total = ref(0)
const closingId = ref('')
/* 用户详情「数据概览」跳转带入的提交人筛选 */
const publisherName = ref('')
/* 企业详情「数据概览」跳转带入的企业筛选（值为社区企业 ID 或合作企业 ID，标签显示名称） */
const enterpriseName = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  category: '',
  demandType: '',
  status: '',
  publisherId: '',
  enterprise: '',
})

/* 排序：默认创建时间倒序（最新在前），支持创建时间正/倒序 */
const sortBy = ref<'createdAt' | 'id'>('createdAt')
const sortOrder = ref<'ascend' | 'descend'>('descend')

/* 类别选项来自数据字典，加载失败回退默认词表 */
const categoryOptions = ref([
  { label: '全部', value: '' },
  ...dictFallback.demand_category.map((label) => ({ label, value: label })),
])

const statusOptions = [
  { label: '全部', value: '' },
  { label: '待审核', value: 'pending' },
  { label: '待发布', value: 'pending_release' },
  { label: '定时发布中', value: 'scheduled' },
  { label: '已发布', value: 'published' },
  { label: '已选定', value: 'selected' },
  { label: '已驳回', value: 'rejected' },
  { label: '已立项', value: 'projected' },
  { label: '已关闭', value: 'closed' },
]
const demandTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '找服务', value: 'task' },
  { label: '找投资', value: 'investment' },
  { label: '找合作', value: 'cooperation' },
]
const demandTypeLabel: Record<string, string> = { task: '找服务', investment: '找投资', cooperation: '找合作' }

const columns = [
  { colKey: 'title', title: '需求', cell: 'title', width: 210, resizable: true , ellipsis: true},
  { colKey: 'category', title: '类别', cell: 'category', width: 95, resizable: true , ellipsis: true},
  { colKey: 'demandType', title: '需求类型', cell: 'demandType', width: 100, resizable: true, ellipsis: true },
  { colKey: 'publisher', title: '需求方', cell: 'publisher', width: 200, resizable: true , ellipsis: true},
  { colKey: 'budget', title: '预算', width: 125, resizable: true , ellipsis: true},
  { colKey: 'respondents', title: '响应', cell: 'respondents', width: 92, resizable: true , ellipsis: true},
  {
    colKey: 'createdAt',
    title: '创建时间',
    width: 150,
    resizable: true,
    sorter: true,
    sortType: 'all',
  ellipsis: true,
  },
  {
    colKey: 'publishedAt',
    title: '发布时间',
    cell: 'publishedAt',
    width: 150,
    resizable: true,
    sorter: true,
    sortType: 'all',
  ellipsis: true,
  },
  { colKey: 'status', title: '状态', cell: 'status', width: 150, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 270 },
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
    const res = await fetchDemands({ ...query, sortBy: sortBy.value, sortOrder: sortOrder.value })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

/* 导出当前页需求列表为 CSV */
function onExport() {
  exportCsv(
    '需求列表',
    ['编号', '标题', '类别', '需求方', '预算', '响应数', '状态', '创建时间', '发布时间'],
    list.value.map((d) => [
      d.id,
      d.title,
      d.category,
      d.publisherName,
      d.budget,
      d.respondents.length,
      statusLabel('demand', d.status),
      d.createdAt,
      d.publishedAt ?? '—',
    ]),
  )
  MessagePlugin.success(`已导出当前页 ${list.value.length} 条数据`)
}

/* 全量导出：按现有筛选条件拉取全部页后导出；服务端导出落地后切换 */
const exportingAll = ref(false)

async function onExportAll() {
  exportingAll.value = true
  try {
    const count = await exportAllRows<Demand>(
      '需求列表全量',
      ['编号', '标题', '类别', '需求方', '预算', '响应数', '状态', '创建时间', '发布时间'],
      (d) => [
        d.id,
        d.title,
        d.category,
        d.publisherName,
        d.budget,
        d.respondents.length,
        statusLabel('demand', d.status),
        d.createdAt,
        d.publishedAt ?? '—',
      ],
      (page, pageSize) =>
        fetchDemands({ ...query, page, pageSize, sortBy: sortBy.value, sortOrder: sortOrder.value }),
    )
    MessagePlugin.success(`已导出全部 ${count} 条需求数据`)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '导出失败')
  } finally {
    exportingAll.value = false
  }
}

/* 远程排序：表头点击 → 更新排序状态 → 重新加载（受控 :sort 保证表头指示器正确） */
function onSortChange(sort: { sortBy: string; descending: boolean }) {
  if (sort.sortBy !== 'createdAt' && sort.sortBy !== 'publishedAt') return
  sortBy.value = sort.sortBy
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
  query.category = ''
  query.demandType = ''
  query.status = ''
  query.publisherId = ''
  query.enterprise = ''
  publisherName.value = ''
  enterpriseName.value = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 新增 / 完成并发布 / 编辑（同一弹窗组件，mode 区分） */
const publishVisible = ref(false)
const publishMode = ref<'create' | 'publish' | 'edit'>('publish')
const current = ref<Demand | null>(null)

function openCreate() {
  current.value = null
  publishMode.value = 'create'
  publishVisible.value = true
}

function openEdit(row: Demand) {
  current.value = row
  /* 待发布/已发布走普通编辑（不改状态） */
  publishMode.value = 'edit'
  publishVisible.value = true
}

/* 待审核 → 只读审核对话框（通过 = 转待发布；驳回需填原因） */
const reviewVisible = ref(false)

function openReview(row: Demand) {
  current.value = row
  reviewVisible.value = true
}

/* 待发布 → 定时发布对话框（设定定时发布时间 → 定时发布中） */
const scheduleVisible = ref(false)

function openSchedule(row: Demand) {
  current.value = row
  scheduleVisible.value = true
}

/* 待发布 → 立即发布 */
const publishingId = ref('')

async function onPublishNow(row: Demand) {
  publishingId.value = row.id
  try {
    await publishDemandNow(row.id)
    MessagePlugin.success('需求已发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    publishingId.value = ''
  }
}

/* 定时发布中 → 取消定时发布，转回待发布 */
const cancelSchedulingId = ref('')

async function onCancelSchedule(row: Demand) {
  cancelSchedulingId.value = row.id
  try {
    await cancelDemandSchedule(row.id)
    MessagePlugin.success('已取消定时发布，需求转入待发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    cancelSchedulingId.value = ''
  }
}

/* 已发布 → 撤回发布，转回待发布 */
const takedownDialog = ref<InstanceType<typeof ContentTakedownDialog>>()
function onRetract(row: Demand) {
  takedownDialog.value?.open('demand', row)
}

/* 关闭 */
async function onCloseDemand(row: Demand) {
  closingId.value = row.id
  try {
    await closeDemand(row.id)
    MessagePlugin.success('已关闭该需求')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    closingId.value = ''
  }
}

/* 已驳回 / 已关闭 / 已立项 → 归档（可在归档管理中恢复） */
const archivingId = ref('')

async function onArchiveDemand(row: Demand) {
  archivingId.value = row.id
  try {
    await archiveDemand(row.id)
    MessagePlugin.success('需求已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    archivingId.value = ''
  }
}

/* 一键归档：按当前筛选全量拉取，归档所选状态的已驳回 / 已关闭 / 已立项需求 */
const archivingAll = ref(false)
const bulkVisible = ref(false)
const bulkStatuses = [
  { label: '已驳回', value: 'rejected' },
  { label: '已关闭', value: 'closed' },
  { label: '已立项', value: 'projected' },
]

async function doBulkArchive(values: string[]) {
  const targets: Demand[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetchDemands({ ...query, page, pageSize: 100 })
    targets.push(...res.list)
    if (targets.length >= res.total || res.list.length < 100) break
  }
  const pending = targets.filter((d) => values.includes(d.status))
  if (!pending.length) {
    MessagePlugin.info('没有符合所选状态的可归档需求')
    return
  }
  let failed = 0
  for (const d of pending) {
    try {
      await archiveDemand(d.id)
    } catch {
      failed++
    }
  }
  if (pending.length - failed > 0) MessagePlugin.success(`已归档 ${pending.length - failed} 条需求`)
  if (failed > 0) MessagePlugin.warning(`${failed} 条需求归档失败，请重试`)
  await load()
}

function onBulkArchive() {
  bulkVisible.value = true
}

async function onBulkConfirm(values: string[]) {
  archivingAll.value = true
  try {
    await doBulkArchive(values)
    bulkVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '一键归档失败')
  } finally {
    archivingAll.value = false
  }
}

/* 立项 */
const projectVisible = ref(false)

function openProject(row: Demand) {
  current.value = row
  projectVisible.value = true
}

function goDetail(row: Demand) {
  router.push(`/demands/${row.id}`)
}

/* 已立项需求 → 跳转关联项目 */
function goProject(row: Demand) {
  if (row.projectId) router.push(`/projects/${row.projectId}`)
}

/* 用户详情「数据概览」跳转带入提交人 ID（query: publisher），按 ID 过滤避免同名歧义；
 * 企业详情「数据概览」跳转带入企业 ID（query: enterprise，社区企业 E* / 合作企业 XE*），
 * 标签显示名称：社区企业经 fetchEnterprise、合作企业经 fetchExternalEnterprise 由 ID 解析 */
async function applyRouteFilter() {
  publisherName.value = ''
  enterpriseName.value = ''
  if (query.publisherId) {
    try {
      const u = await fetchUser(query.publisherId)
      publisherName.value = u.nickname
    } catch {
      /* 用户不存在时标签回退显示 ID */
    }
  }
  if (query.enterprise) {
    try {
      const res = await fetchEnterprise(query.enterprise)
      enterpriseName.value = res.enterprise.name
    } catch {
      /* 非社区企业 ID：尝试按合作企业 ID 解析名称 */
      try {
        const ext = await fetchExternalEnterprise(query.enterprise)
        enterpriseName.value = ext.name
      } catch {
        /* 均未命中时标签回退显示原值 */
      }
    }
  }
}

function clearPublisher() {
  query.publisherId = ''
  publisherName.value = ''
  query.page = 1
  load()
}

function clearEnterprise() {
  query.enterprise = ''
  enterpriseName.value = ''
  query.page = 1
  load()
}

watch(() => [query.publisherId, query.enterprise], applyRouteFilter)

const { syncQuery } = useListQueryState(query, load, { refs: { sortBy, sortOrder }, aliases: { publisherId: 'publisher' } })

onMounted(() => {
  applyRouteFilter()
  load()
  fetchDictEntries('demand_category')
    .then((entries) => {
      const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
      if (labels.length) categoryOptions.value = [{ label: '全部', value: '' }, ...labels]
    })
    .catch(() => {
      /* 字典加载失败保留回退词表 */
    })
})
</script>

<template>
  <div class="demand-list page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <PageHeader title="需求管理" description="需求广场的新增、审核、发布编辑与立项管理">
      <template #actions>
        <ColumnController
          v-model="visibleColKeys"
          storage-key="demands"
          :columns="columns.map((c) => ({ key: c.colKey, title: c.title }))"
        />
        <t-button variant="outline" :loading="archivingAll" :disabled="archivingAll" @click="onBulkArchive">
          一键归档
        </t-button>
        <t-button variant="outline" :loading="exportingAll" @click="onExportAll">
          <template #icon><DownloadIcon /></template>
          导出全部
        </t-button>
        <t-button variant="outline" @click="onExport">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
        <t-button theme="primary" @click="openCreate">
          <template #icon><AddIcon /></template>
          新增需求
        </t-button>
      </template>
    </PageHeader>

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索标题/编号…"
        clearable
        @enter="onSearch"
      />
      <t-select
        v-model="query.category"
        label="类别"
        :options="categoryOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-select
        v-model="query.demandType"
        label="需求类型"
        :options="demandTypeOptions"
        clearable
        style="width: 140px"
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
        重置
      </t-button>
      <t-tag
        v-if="query.publisherId"
        closable
        variant="light"
        theme="primary"
        @close="clearPublisher"
      >
        提交人：{{ publisherName || query.publisherId }}
      </t-tag>
      <t-tag
        v-if="query.enterprise"
        closable
        variant="light"
        theme="primary"
        @close="clearEnterprise"
      >
        企业：{{ enterpriseName || query.enterprise }}
      </t-tag>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="visibleColumns"
        :sort="tableSort"
        :loading="loading"
        :pagination="pagination"
        empty="暂无需求"
        @page-change="onPageChange"
        @sort-change="onSortChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #title="{ row }">
          <div class="demand-cell">
            <span class="demand-title">{{ row.title }}</span>
            <span class="demand-id">{{ row.id }}</span>
          </div>
        </template>

        <template #category="{ row }">
          <t-tag variant="light">{{ row.category }}</t-tag>
        </template>
        <template #demandType="{ row }">
          <t-tag variant="light" theme="primary">{{ demandTypeLabel[row.demandType] ?? row.demandType }}</t-tag>
        </template>

        <template #publisher="{ row }">
          <div class="publisher-cell">
            <span class="publisher-name">{{ publisherNameOf(row) }}</span>
            <div class="tag-row">
              <t-tag v-if="row.publisherId" size="small" variant="light">{{ row.publisherId }}</t-tag>
              <t-tag
                v-if="publisherTagOf(row)"
                size="small"
                :theme="publisherTagOf(row)!.theme"
                :variant="publisherTagOf(row)!.variant"
              >
                {{ publisherTagOf(row)!.text }}
              </t-tag>
            </div>
          </div>
        </template>

        <template #respondents="{ row }">
          <div class="stack-cell">
            <span>{{ row.respondents.length }}</span>
            <!-- 标签色：等于积分规则默认值=绿色；低于=红色；高于=橙色 -->
            <t-tag
              :theme="respondPointsTheme(row)"
              variant="light"
              size="small"
              class="pts-tag"
            >
              {{ row.respondPoints ?? rulePoints.respond }}积分
            </t-tag>
          </div>
        </template>

        <template #publishedAt="{ row }">{{ row.publishedAt ?? '—' }}</template>

        <template #status="{ row }">
          <StatusTag entity="demand" :value="row.status" :scheduled-at="row.scheduledAt" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <!-- 待审核：仅只读审核 -->
            <t-button
              v-if="row.status === 'pending'"
              variant="text"
              size="small"
              theme="primary"
              @click="openReview(row)"
            >
              审核
            </t-button>
            <!-- 待发布：编辑 / 立即发布 / 定时发布 / 关闭 -->
            <template v-if="row.status === 'pending_release'">
              <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
              <t-popconfirm content="确认立即发布该需求？发布后成员即可响应" @confirm="onPublishNow(row)">
                <t-button
                  variant="text"
                  size="small"
                  theme="primary"
                  :loading="publishingId === row.id"
                >
                  立即发布
                </t-button>
              </t-popconfirm>
              <t-button variant="text" size="small" @click="openSchedule(row)">定时发布</t-button>
            </template>
            <!-- 已选定：发布者已选择意向承接方，等待管理员手动立项 -->
            <t-button
              v-if="row.status === 'selected'"
              variant="text"
              size="small"
              theme="primary"
              @click="openProject(row)"
            >
              立项
            </t-button>
            <!-- 已发布：立项 / 撤回发布 / 关闭 / 代报名（关闭后） -->
            <template v-if="row.status === 'published'">
              <t-button variant="text" size="small" theme="primary" @click="openProject(row)">立项</t-button>
              <t-button
                variant="text"
                size="small"
                theme="warning"
                @click="onRetract(row)"
              >
                撤回发布
              </t-button>
            </template>
            <!-- 定时发布中：取消定时发布（状态标签直接显示定时发布时间） -->
            <t-popconfirm
              v-if="row.status === 'scheduled'"
              content="确认取消定时发布？该需求将转为「待发布」"
              @confirm="onCancelSchedule(row)"
            >
              <t-button
                variant="text"
                size="small"
                theme="warning"
                :loading="cancelSchedulingId === row.id"
              >
                取消定时发布
              </t-button>
            </t-popconfirm>
            <!-- 已立项：查看关联项目 -->
            <t-button v-if="row.status === 'projected'" variant="text" size="small" theme="primary" @click="goProject(row)">
              查看关联项目
            </t-button>
            <t-popconfirm
              v-if="row.status === 'pending_release'"
              content="确认关闭该需求？"
              @confirm="onCloseDemand(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="closingId === row.id">关闭</t-button>
            </t-popconfirm>
            <!-- 代报名：置于关闭之后（published / projected 可用） -->
            <t-button
              v-if="row.status === 'published' || row.status === 'projected'"
              variant="text"
              size="small"
              @click="openProxy(row)"
            >
              代报名
            </t-button>
            <!-- 已驳回 / 已关闭 / 已立项：归档（可在归档管理中恢复） -->
            <t-popconfirm
              v-if="row.status === 'rejected' || row.status === 'closed' || row.status === 'projected'"
              content="确认归档该需求？归档后可在归档管理中恢复"
              @confirm="onArchiveDemand(row)"
            >
              <t-button variant="text" size="small" theme="warning" :loading="archivingId === row.id">归档</t-button>
            </t-popconfirm>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 新增 / 完成并发布 / 编辑弹窗 -->
    <DemandPublishDialog v-model:visible="publishVisible" :mode="publishMode" :demand="current" @success="load" />

    <!-- 待审核：只读审核对话框 -->
    <DemandReviewDialog v-model:visible="reviewVisible" :demand="current" @success="load" />

    <!-- 待发布：定时发布对话框 -->
    <DemandScheduleDialog v-model:visible="scheduleVisible" :demand="current" @success="load" />
    <ContentTakedownDialog ref="takedownDialog" @success="load" />

    <!-- 立项弹窗 -->
    <ProjectFormDialog v-model:visible="projectVisible" mode="create" :demand="current" :project="null" @success="load" />
    <!-- 代报名弹窗：代成员响应需求 -->
    <t-dialog
      :visible="proxyVisible"
      :header="proxyTarget ? `代报名 · ${proxyTarget.title}` : '代报名'"
      width="480px"
      @close="proxyVisible = false"
    >
      <t-form
        ref="proxyFormRef"
        :data="proxyForm"
        :rules="proxyRules"
        label-align="top"
      >
        <t-form-item label="报名方" name="memberValue">
          <t-select
            v-model="proxyForm.memberValue"
            filterable
            creatable
            :options="proxyOptions"
            placeholder="选择已注册的个人用户/企业，或直接输入新报名方…"
          />
          <div class="field-help">未注册的报名方可直接输入名称新增；选中已注册将自动填充联系电话</div>
        </t-form-item>
        <div class="form-row">
          <t-form-item label="联系电话" name="phone">
            <t-input clearable v-model="proxyForm.phone" name="proxy-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="必填…" />
          </t-form-item>
          <t-form-item label="联系邮箱" name="email">
            <t-input clearable v-model="proxyForm.email" name="proxy-email" type="email" inputmode="email" autocomplete="email" placeholder="选填…" />
          </t-form-item>
        </div>
        <t-form-item label="报价" name="quote">
          <t-input clearable v-model="proxyForm.quote" placeholder="如 ¥8,000…" />
        </t-form-item>
        <t-form-item label="响应留言" name="message">
          <t-textarea
            v-model="proxyForm.message"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="代报名备注，留空默认记录「管理员代报名」…"
          />
        </t-form-item>
      </t-form>
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="proxyVisible = false">取消</t-button>
          <t-button theme="primary" :loading="proxySaving" @click="onProxyConfirm">确认代报名</t-button>
        </div>
      </template>
    </t-dialog>

    <!-- 一键归档：状态选择二次确认对话框 -->
    <BulkArchiveDialog
      v-model:visible="bulkVisible"
      title="一键归档 · 需求"
      :statuses="bulkStatuses"
      :loading="archivingAll"
      @confirm="onBulkConfirm"
    />
  </div>
</template>

<style scoped>
.filter-keyword {
  width: 220px;
}

.demand-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.demand-title {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demand-id {
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.publisher-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.publisher-name {
  font-size: 14px;
  line-height: 20px;
  color: var(--td-text-color-primary);
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}
.stack-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.pts-tag {
  font-size: 11px;
}
</style>
