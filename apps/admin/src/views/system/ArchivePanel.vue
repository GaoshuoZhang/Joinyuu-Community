<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { DeleteIcon, RollbackIcon, SearchIcon, SettingIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import { goodsCategoryMap, type StatusEntity } from '@/constants/status'
import {
  fetchArchiveList,
  fetchArchiveSettings,
  purgeArchived,
  restoreArchived,
  updateArchiveSettings,
  type ArchiveItem,
  type ArchiveSetting,
} from '@/api/trash'
import { deriveReservationStatus } from '@/utils/reservation'

/* 归档管理：各业务域归档对象集中管理（恢复/彻底删除）+ 按标签页独立归档设置 */

const archiveTabs = [
  { value: 'enterprise', label: '社区企业' },
  { value: 'externalEnterprise', label: '合作企业' },
  { value: 'article', label: '资讯发布' },
  { value: 'submission', label: '投稿内容' },
  { value: 'announcement', label: '公告栏' },
  { value: 'demand', label: '需求' },
  { value: 'project', label: '项目' },
  { value: 'event', label: '活动' },
  { value: 'lease', label: '租赁' },
  { value: 'reservation', label: '空间预约' },
  { value: 'goods', label: '商品' },
  { value: 'order', label: '商城订单' },
  { value: 'application', label: '申请审核' },
]

/* 用户个人历史信息域：彻底删除或开启自动删除需三连确认（含强确认输入） */
const USER_HISTORY_DOMAINS = new Set([
  'application',
  'demand',
  'project',
  'event',
  'lease',
  'submission',
  'reservation',
  'order',
])

const STRONG_CONFIRM_TEXT = '永久删除'

function isUserHistoryDomain(domain: string) {
  return USER_HISTORY_DOMAINS.has(domain)
}

const applicationTypeTextMap: Record<string, string> = {
  settle: '企业入驻',
  individual: '个体入驻',
  cooperation: '企业合作',
  identity: '身份绑定',
}

const applicationStatusTextMap: Record<string, string> = {
  approved: '已通过',
  rejected: '已驳回',
}

const statusEntityMap: Record<string, StatusEntity> = {
  enterprise: 'enterprise',
  externalEnterprise: 'enterprise',
  article: 'article',
  submission: 'article',
  announcement: 'announcement',
  demand: 'demand',
  project: 'project',
  event: 'event',
  lease: 'lease',
  reservation: 'reservation',
  goods: 'goods',
  order: 'redemption',
}

interface ArchiveColumn {
  colKey: string
  title: string
  width?: number
  resizable?: boolean
  ellipsis?: boolean
  cell?: string
}

const loading = ref(false)
const acting = ref('')
const list = ref<ArchiveItem[]>([])
const total = ref(0)
const activeDomain = ref('enterprise')
const keyword = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
})

const activeTabLabel = computed(
  () => archiveTabs.find((t) => t.value === activeDomain.value)?.label ?? '',
)

const statusEntity = computed<StatusEntity>(
  () => statusEntityMap[activeDomain.value] ?? 'article',
)

const activeDomainIsUserHistory = computed(() => isUserHistoryDomain(activeDomain.value))

const columns = computed<ArchiveColumn[]>(() => {
  const deletedAt: ArchiveColumn = {
    colKey: 'deletedAt',
    title: '归档时间',
    width: 170,
    resizable: true,
    ellipsis: true,
  }
  const deletedBy: ArchiveColumn = {
    colKey: 'deletedBy',
    title: '归档人',
    width: 120,
    resizable: true,
    ellipsis: true,
  }
  const op: ArchiveColumn = { colKey: 'op', title: '操作', width: 170, cell: 'op' }

  switch (activeDomain.value) {
    case 'enterprise':
    case 'externalEnterprise':
      return [
        { colKey: 'name', title: '企业名称', cell: 'name', width: 220, resizable: true, ellipsis: true },
        { colKey: 'industry', title: '行业', cell: 'industry', width: 140, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'article':
      return [
        { colKey: 'title', title: '标题', cell: 'title', width: 240, resizable: true, ellipsis: true },
        { colKey: 'columnName', title: '栏目', cell: 'columnName', width: 140, resizable: true, ellipsis: true },
        { colKey: 'authorName', title: '作者', cell: 'authorName', width: 120, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'submission':
      return [
        { colKey: 'title', title: '标题', cell: 'title', width: 240, resizable: true, ellipsis: true },
        { colKey: 'authorName', title: '投稿方', cell: 'authorName', width: 120, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'announcement':
      return [
        { colKey: 'title', title: '标题', cell: 'title', width: 260, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        { colKey: 'pinned', title: '置顶', cell: 'pinned', width: 80, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'demand':
      return [
        { colKey: 'title', title: '标题', cell: 'title', width: 240, resizable: true, ellipsis: true },
        { colKey: 'publisherName', title: '需求方', cell: 'publisherName', width: 120, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'project':
      return [
        { colKey: 'name', title: '项目名称', cell: 'name', width: 220, resizable: true, ellipsis: true },
        { colKey: 'code', title: '编号', cell: 'code', width: 140, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'event':
      return [
        { colKey: 'title', title: '活动标题', cell: 'title', width: 220, resizable: true, ellipsis: true },
        { colKey: 'startTime', title: '开始时间', cell: 'startTime', width: 170, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'lease':
      return [
        { colKey: 'id', title: '租约编号', width: 140, resizable: true, ellipsis: true },
        { colKey: 'renterName', title: '租赁方', cell: 'renterName', width: 140, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'reservation':
      return [
        { colKey: 'userName', title: '预约人', cell: 'userName', width: 120, resizable: true, ellipsis: true },
        { colKey: 'spaceName', title: '空间', cell: 'spaceName', width: 130, resizable: true, ellipsis: true },
        { colKey: 'timeSlot', title: '日期时段', cell: 'timeSlot', width: 200, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'goods':
      return [
        { colKey: 'id', title: '商品编号', width: 140, resizable: true, ellipsis: true },
        { colKey: 'name', title: '商品名称', cell: 'name', width: 220, resizable: true, ellipsis: true },
        { colKey: 'category', title: '类型', cell: 'category', width: 110, resizable: true, ellipsis: true },
        { colKey: 'points', title: '所需积分', cell: 'points', width: 100, resizable: true, ellipsis: true },
        { colKey: 'stock', title: '库存', cell: 'stock', width: 90, resizable: true, ellipsis: true },
        { colKey: 'redeemedCount', title: '累计兑换', cell: 'redeemedCount', width: 100, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'order':
      return [
        { colKey: 'id', title: '订单编号', width: 140, resizable: true, ellipsis: true },
        { colKey: 'userName', title: '用户', cell: 'userName', width: 120, resizable: true, ellipsis: true },
        { colKey: 'goodsName', title: '商品', cell: 'goodsName', width: 200, resizable: true, ellipsis: true },
        { colKey: 'points', title: '积分', cell: 'points', width: 90, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        { colKey: 'createdAt', title: '创建时间', cell: 'createdAt', width: 170, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    case 'application':
      return [
        { colKey: 'applicationId', title: '编号', cell: 'applicationId', width: 140, resizable: true, ellipsis: true },
        { colKey: 'type', title: '申请类型', cell: 'applicationType', width: 110, resizable: true, ellipsis: true },
        { colKey: 'applicantName', title: '申请人', cell: 'applicantName', width: 120, resizable: true, ellipsis: true },
        { colKey: 'targetName', title: '申请对象', cell: 'targetName', width: 200, resizable: true, ellipsis: true },
        { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true, ellipsis: true },
        deletedAt,
        deletedBy,
        op,
      ]
    default:
      return [deletedAt, deletedBy, op]
  }
})

async function load() {
  loading.value = true
  try {
    const res = await fetchArchiveList({
      domain: activeDomain.value,
      page: query.page,
      pageSize: query.pageSize,
      keyword: keyword.value.trim() || undefined,
    })
    list.value = res.list
    total.value = res.total
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '数据加载失败')
  } finally {
    loading.value = false
  }
}

function onDomainChange(value: string | number) {
  activeDomain.value = String(value)
  keyword.value = ''
  query.page = 1
  load()
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  keyword.value = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

async function onRestore(row: ArchiveItem) {
  acting.value = row.id + ':restore'
  try {
    await restoreArchived(activeDomain.value, row.id)
    MessagePlugin.success('已恢复')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '恢复失败')
  } finally {
    acting.value = ''
  }
}

/* 三连确认：普通确认 ×2 + 强确认（输入指定文本）。任意一步取消即中止 */
function confirmArchiveStep(header: string, body: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (value: boolean) => {
      if (settled) return
      settled = true
      dialog.destroy()
      resolve(value)
    }
    const dialog = DialogPlugin.confirm({
      header,
      body,
      confirmBtn: '继续',
      cancelBtn: '取消',
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
      onClose: () => settle(false),
    })
  })
}

interface TripleConfirmOptions {
  first: string
  second: string
  strong: string
  actionText?: string
}

async function confirmArchiveTriple(options: TripleConfirmOptions): Promise<boolean> {
  if (!(await confirmArchiveStep('安全确认（1/3）', options.first))) return false
  if (!(await confirmArchiveStep('安全确认（2/3）', options.second))) return false
  return openStrongConfirm(options.strong, options.actionText)
}

const strongConfirmVisible = ref(false)
const strongConfirmInput = ref('')
const strongConfirmMessage = ref('')
const strongConfirmActionText = ref('确认删除')
let strongConfirmResolve: ((value: boolean) => void) | null = null

const strongConfirmError = computed(() =>
  strongConfirmInput.value && strongConfirmInput.value !== STRONG_CONFIRM_TEXT
    ? `输入不正确，请输入“${STRONG_CONFIRM_TEXT}”`
    : '',
)

function openStrongConfirm(message: string, actionText = '确认删除'): Promise<boolean> {
  strongConfirmMessage.value = message
  strongConfirmActionText.value = actionText
  strongConfirmInput.value = ''
  strongConfirmVisible.value = true
  return new Promise((resolve) => {
    strongConfirmResolve = resolve
  })
}

function settleStrongConfirm(value: boolean) {
  const resolve = strongConfirmResolve
  strongConfirmResolve = null
  strongConfirmVisible.value = false
  resolve?.(value)
}

function onStrongConfirmSubmit() {
  if (strongConfirmInput.value !== STRONG_CONFIRM_TEXT) return
  settleStrongConfirm(true)
}

async function onPurge(row: ArchiveItem) {
  if (isUserHistoryDomain(activeDomain.value)) {
    const confirmed = await confirmArchiveTriple({
      first: '该操作涉及用户个人历史信息，彻底删除后不可恢复，是否继续？',
      second: '请再次确认：该条目将从系统中永久移除。',
      strong: `「${activeTabLabel.value}」中的条目“${row.title || row.id}”将被永久移除，且不可恢复。请输入“${STRONG_CONFIRM_TEXT}”以确认删除。`,
    })
    if (!confirmed) return
  }
  acting.value = row.id + ':purge'
  try {
    await purgeArchived(activeDomain.value, row.id)
    MessagePlugin.success('已彻底删除')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

const settingsVisible = ref(false)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const currentSetting = ref<ArchiveSetting | null>(null)
const originalAutoPurge = ref(false)

async function openSettings() {
  settingsVisible.value = true
  settingsLoading.value = true
  currentSetting.value = null
  originalAutoPurge.value = false
  try {
    const all = await fetchArchiveSettings()
    currentSetting.value = all.find((s) => s.domain === activeDomain.value) ?? null
    originalAutoPurge.value = currentSetting.value?.autoPurge ?? false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档设置加载失败')
    settingsVisible.value = false
  } finally {
    settingsLoading.value = false
  }
}

async function onSaveSettings() {
  if (!currentSetting.value) return
  if (
    isUserHistoryDomain(currentSetting.value.domain) &&
    !originalAutoPurge.value &&
    currentSetting.value.autoPurge
  ) {
    const domainLabel = currentSetting.value.label || activeTabLabel.value
    const confirmed = await confirmArchiveTriple({
      first: `「${domainLabel}」涉及用户个人历史信息，开启自动删除后相关条目将被永久移除且不可恢复，是否继续？`,
      second: '请再次确认：系统将自动永久删除该域下的用户历史信息。',
      strong: `自动删除开启后，归档数据将在延时到期后被永久移除，且不可恢复。请输入“${STRONG_CONFIRM_TEXT}”以确认开启。`,
      actionText: '确认开启',
    })
    if (!confirmed) return
  }
  settingsSaving.value = true
  try {
    const archiveStatuses: Record<string, boolean> = {}
    for (const st of currentSetting.value.archivableStatuses ?? []) {
      archiveStatuses[st.value] = st.enabled
    }
    const updated = await updateArchiveSettings(currentSetting.value.domain, {
      autoArchive: currentSetting.value.autoArchive,
      archiveDelayDays: Number(currentSetting.value.archiveDelayDays) || 0,
      autoPurge: currentSetting.value.autoPurge,
      purgeDelayDays: Number(currentSetting.value.purgeDelayDays) || 1,
      archiveStatuses,
    })
    currentSetting.value = updated
    originalAutoPurge.value = updated.autoPurge
    MessagePlugin.success('归档设置已保存')
    settingsVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    settingsSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="archive-panel page-fade-in">
    <PageHeader
      title="归档管理"
      description="集中管理各业务域归档对象，可恢复或彻底删除；各标签页支持独立归档设置"
    />

    <t-tabs :value="activeDomain" class="archive-tabs" @change="onDomainChange">
      <t-tab-panel v-for="tab in archiveTabs" :key="tab.value" :value="tab.value" :label="tab.label" />
    </t-tabs>

    <div class="page-filter-bar">
      <t-input
        v-model="keyword"
        class="toolbar-keyword"
        clearable
        placeholder="搜索名称/编号"
        @enter="onSearch"
      />
      <t-button theme="primary" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" @click="onReset">重置</t-button>
      <div class="toolbar-right">
        <t-button variant="outline" @click="openSettings">
          <template #icon><SettingIcon /></template>
          归档设置
        </t-button>
      </div>
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
        empty="暂无归档数据"
      >
        <template #name="{ row }">{{ row.data.name }}</template>
        <template #industry="{ row }">{{ row.data.industry || '—' }}</template>
        <template #title="{ row }">{{ row.data.title }}</template>
        <template #columnName="{ row }">{{ row.data.columnName || '—' }}</template>
        <template #authorName="{ row }">{{ row.data.authorName || '—' }}</template>
        <template #status="{ row }">
          <StatusTag
            v-if="activeDomain === 'reservation'"
            entity="reservation"
            :value="deriveReservationStatus(row.data)"
          />
          <span v-else-if="activeDomain === 'application'">
            {{ applicationStatusTextMap[row.data.status] || row.data.status || '—' }}
          </span>
          <StatusTag v-else :entity="statusEntity" :value="row.data.status" />
        </template>
        <template #applicationId="{ row }">{{ row.data.id }}</template>
        <template #applicationType="{ row }">
          {{ applicationTypeTextMap[row.data.type] || row.data.type || '—' }}
        </template>
        <template #applicantName="{ row }">{{ row.data.applicantName || '—' }}</template>
        <template #targetName="{ row }">{{ row.data.targetName || '—' }}</template>
        <template #pinned="{ row }">{{ row.data.pinned ? '是' : '否' }}</template>
        <template #publisherName="{ row }">{{ row.data.publisherName || '—' }}</template>
        <template #code="{ row }">{{ row.data.code || '—' }}</template>
        <template #startTime="{ row }">{{ row.data.startTime || '—' }}</template>
        <template #renterName="{ row }">{{ row.data.renterName || '—' }}</template>
        <template #userName="{ row }">{{ row.data.userName }}</template>
        <template #spaceName="{ row }">{{ row.data.spaceName }}</template>
        <template #timeSlot="{ row }">{{ row.data.date }} {{ row.data.startTime }}~{{ row.data.endTime }}</template>
        <template #category="{ row }">{{ goodsCategoryMap[row.data.category] || row.data.category || '—' }}</template>
        <template #points="{ row }">{{ row.data.points ?? '—' }}</template>
        <template #stock="{ row }">{{ row.data.stock ?? '—' }}</template>
        <template #redeemedCount="{ row }">{{ row.data.redeemedCount ?? '—' }}</template>
        <template #goodsName="{ row }">{{ row.data.goodsName || '—' }}</template>
        <template #createdAt="{ row }">{{ row.data.createdAt || '—' }}</template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-popconfirm content="确认恢复该对象？" @confirm="onRestore(row)">
              <t-button variant="text" size="small" :loading="acting === row.id + ':restore'">
                <template #icon><RollbackIcon /></template>
                恢复
              </t-button>
            </t-popconfirm>
            <t-popconfirm
              v-if="!activeDomainIsUserHistory"
              theme="danger"
              content="确认彻底删除该对象？删除后不可恢复"
              @confirm="onPurge(row)"
            >
              <t-button
                variant="text"
                theme="danger"
                size="small"
                :loading="acting === row.id + ':purge'"
              >
                <template #icon><DeleteIcon /></template>
                彻底删除
              </t-button>
            </t-popconfirm>
            <t-button
              v-else
              variant="text"
              theme="danger"
              size="small"
              :loading="acting === row.id + ':purge'"
              @click="onPurge(row)"
            >
              <template #icon><DeleteIcon /></template>
              彻底删除
            </t-button>
          </div>
        </template>
      </t-table>

      <div class="table-footer">
        <t-pagination
          :current="query.page"
          :page-size="query.pageSize"
          :total="total"
          :page-size-options="[10, 20, 50]"
          show-jumper
          @change="onPageChange"
        />
      </div>
    </div>

    <t-dialog
      v-model:visible="settingsVisible"
      :header="`归档设置 · ${activeTabLabel}`"
      width="520px"
      @close="settingsVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="settingsVisible = false">取消</t-button>
          <t-button theme="primary" :loading="settingsSaving" @click="onSaveSettings">保存</t-button>
        </div>
      </template>
      <t-loading :loading="settingsLoading" size="small">
        <t-form v-if="currentSetting" :data="currentSetting" label-align="top">
          <div v-if="currentSetting.autoArchiveSupported" class="setting-section">
            <t-form-item label="自动归档">
              <t-switch v-model="currentSetting.autoArchive" />
            </t-form-item>
            <t-form-item label="自动归档延时（天）">
              <t-input-number
                v-model="currentSetting.archiveDelayDays"
                :min="0"
                :max="365"
                :step="1"
                theme="column"
                style="width: 200px"
                :disabled="!currentSetting.autoArchive"
              />
            </t-form-item>
            <div class="setting-desc">达到可归档状态后，超过延时天数将自动移入归档</div>
            <t-form-item
              v-if="currentSetting.archivableStatuses.length"
              label="自动归档状态"
            >
              <div class="status-switch-list">
                <div
                  v-for="st in currentSetting.archivableStatuses"
                  :key="st.value"
                  class="status-switch-item"
                >
                  <span class="status-switch-label">{{ st.label }}</span>
                  <t-switch v-model="st.enabled" size="small" :disabled="!currentSetting.autoArchive" />
                </div>
              </div>
            </t-form-item>
          </div>
          <div class="setting-section">
            <t-form-item label="自动删除">
              <div class="setting-row">
                <div class="setting-danger-switch">
                  <t-switch v-model="currentSetting.autoPurge" />
                </div>
                <span class="setting-warning">自动删除后不可恢复，请谨慎开启</span>
              </div>
            </t-form-item>
            <div class="setting-desc">归档后超过延时天数将物理删除</div>
            <t-form-item label="自动删除延时（天）">
              <t-input-number
                v-model="currentSetting.purgeDelayDays"
                :min="1"
                :max="3650"
                :step="1"
                theme="column"
                style="width: 200px"
                :disabled="!currentSetting.autoPurge"
              />
            </t-form-item>
          </div>
        </t-form>
      </t-loading>
    </t-dialog>

    <t-dialog
      v-model:visible="strongConfirmVisible"
      header="安全确认（3/3） · 强确认"
      width="480px"
      :z-index="3000"
      :close-on-overlay-click="false"
      @close="settleStrongConfirm(false)"
    >
      <div class="strong-confirm-body">{{ strongConfirmMessage }}</div>
      <t-input
        v-model="strongConfirmInput"
        class="strong-confirm-input"
        :status="strongConfirmError ? 'error' : 'default'"
        :tips="strongConfirmError"
        placeholder="请输入指定内容"
        @enter="onStrongConfirmSubmit"
      />
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="settleStrongConfirm(false)">取消</t-button>
          <t-button
            theme="danger"
            :disabled="strongConfirmInput !== STRONG_CONFIRM_TEXT"
            @click="onStrongConfirmSubmit"
          >
            {{ strongConfirmActionText }}
          </t-button>
        </div>
      </template>
    </t-dialog>
  </div>
</template>

<style scoped>
.archive-tabs {
  margin-bottom: 16px;
}

.toolbar-keyword {
  width: 240px;
}

.toolbar-right {
  margin-left: auto;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: nowrap;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.setting-section {
  padding-bottom: 4px;
}

.setting-section + .setting-section {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--td-component-border);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-warning {
  font-size: 12px;
  color: var(--td-error-color);
}

.setting-desc {
  margin: -12px 0 24px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

/* 自动删除开关：复用 TDesign 品牌色变量覆盖为错误色（红色） */
.setting-danger-switch {
  --td-brand-color: var(--td-error-color);
  --td-brand-color-hover: var(--td-error-color-hover);
  --td-brand-color-focus: var(--td-error-color-focus);
  --td-brand-color-disabled: var(--td-error-color-disabled);
}

.status-switch-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.status-switch-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-switch-label {
  font-size: 13px;
  color: var(--td-text-color-primary);
}

.strong-confirm-body {
  margin-bottom: 12px;
  line-height: 1.6;
  color: var(--td-text-color-primary);
}

.strong-confirm-input {
  margin-bottom: 4px;
}
</style>
