<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon, EditIcon, FilePdfFilledIcon, TimeIcon, UploadIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import LeaseFormDialog from '@/components/LeaseFormDialog.vue'
import LeaseRenewDialog from '@/components/LeaseRenewDialog.vue'
import {
  archiveLease,
  deleteLeaseContract,
  deriveLeaseStatus,
  fetchLease,
  fetchLeaseContracts,
  fetchWorkstations,
  terminateLease,
  uploadLeaseContract,
  type LeaseContract,
} from '@/api/workstations'
import { isNotFound } from '@/api/http'
import { formatDateOnly } from '@/utils/format'
import type { Lease, Workstation } from '@/types'

/* 租赁详情页：只读展示租约全量信息 + 办公位 + 终止时间，
 * 供租赁管理列表「详情」与办公位/办公室卡片「查看租赁」共用。
 * 头部操作与租赁管理列表 op 同步（生效中/即将到期：编辑/续期/终止；已到期：续期/终止；已终止：归档），
 * 一律按派生状态判定：存储态 active 的已到期租约不得再编辑（但可续期/终止）。
 * 下方为选项卡：编辑记录 / 续期记录 / 合同（线下纸质合同扫描件，复用素材库存储）。 */
const route = useRoute()
const router = useRouter()
const loading = ref(true)
const lease = ref<Lease | null>(null)
/* 编辑弹窗所需办公位数据（LeaseFormDialog 的 workstations prop） */
const workstations = ref<Workstation[]>([])
const acting = ref('')
const formVisible = ref(false)
/* 续期弹窗 */
const renewVisible = ref(false)
/* 非 404 的加载失败：展示错误与重试入口（403/500/断网不再伪装成「不存在」） */
const loadError = ref('')
/* 已归档条目：隐藏写操作（编辑/续期/终止/归档/合同增删），打印与查看保留 */
const isArchived = computed(() => !!lease.value?.deletedAt)

/* 选项卡：编辑记录 / 续期记录 / 合同 */
const tab = ref<'edits' | 'renews' | 'contracts'>('edits')

const rentPeriodMap: Record<string, string> = { day: '日', week: '周', month: '月', year: '年' }
const renterTypeMap: Record<string, string> = { enterprise: '企业', individual: '用户', custom: '自定义' }

const termText = computed(() => {
  const l = lease.value
  if (!l) return '—'
  return l.longTerm ? `${l.startDate} ~ 长期` : `${l.startDate} ~ ${l.endDate}`
})

const viewStatus = computed(() => (lease.value ? deriveLeaseStatus(lease.value) : 'active'))

/* 头部操作可见性（长期租约无到期日不可续期） */
const canOperate = computed(() => ['active', 'expiring', 'expired'].includes(viewStatus.value))
const canRenew = computed(() => canOperate.value && !lease.value?.longTerm)

function goBack() {
  router.back()
}

/* 租赁方跳转：企业 → 社区企业详情；个人 → 用户详情（自定义不跳） */
function openPrint() {
  if (!lease.value) return
  window.open(router.resolve({ path: `/prints/lease/${lease.value.id}` }).href, '_blank', 'noopener')
}

/* 编辑租约（复用列表页弹窗：仅调整租期/租金/联系人，换办公位需终止后重建） */
function openEdit() {
  if (!lease.value) return
  formVisible.value = true
}

/* 续期（复用列表页续期弹窗：延长到期日并追加续期记录） */
function openRenew() {
  if (!lease.value) return
  renewVisible.value = true
}

/* 终止租约并释放全部关联办公位（同步列表页操作，需二次确认） */
async function onTerminate() {
  if (!lease.value) return
  acting.value = 'terminate'
  try {
    await terminateLease(lease.value.id)
    MessagePlugin.success('租约已终止，关联办公位已释放')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 归档已终止租约（同步列表页操作，可在归档管理中恢复） */
async function onArchive() {
  if (!lease.value) return
  acting.value = 'archive'
  try {
    await archiveLease(lease.value.id)
    MessagePlugin.success('租约已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* ---------- 合同扫描件（线下纸质合同） ---------- */

const contracts = ref<LeaseContract[]>([])
const contractsLoading = ref(false)
const contractsError = ref('')
const uploading = ref(false)
const removingId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function isImage(c: LeaseContract): boolean {
  return c.mime.startsWith('image/')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function loadContracts() {
  const id = lease.value?.id
  if (!id) return
  contractsLoading.value = true
  contractsError.value = ''
  try {
    contracts.value = await fetchLeaseContracts(id)
  } catch (e) {
    contracts.value = []
    contractsError.value = e instanceof Error ? e.message : '合同附件加载失败'
  } finally {
    contractsLoading.value = false
  }
}

function pickContractFile() {
  fileInput.value?.click()
}

/* 支持一次选多个文件：逐个上传，任一失败即中断并提示（已成功的保留） */
async function onContractPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  /* 清空 value：同一文件重复选择也触发 change */
  input.value = ''
  const id = lease.value?.id
  if (!files.length || !id) return
  uploading.value = true
  try {
    for (const file of files) {
      await uploadLeaseContract(id, file)
    }
    MessagePlugin.success(files.length > 1 ? `已上传 ${files.length} 个合同文件` : '合同附件已上传')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '合同上传失败')
  } finally {
    uploading.value = false
    await loadContracts()
  }
}

async function onRemoveContract(item: LeaseContract) {
  const id = lease.value?.id
  if (!id) return
  removingId.value = item.id
  try {
    await deleteLeaseContract(id, item.id)
    MessagePlugin.success('合同附件已删除')
    await loadContracts()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    removingId.value = ''
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    lease.value = await fetchLease(String(route.params.id))
  } catch (e) {
    lease.value = null
    /* 404 = 租约不存在；其余错误保留具体原因并给出重试入口 */
    if (!isNotFound(e)) loadError.value = e instanceof Error ? e.message : '租约加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  void loadContracts()
  try {
    workstations.value = await fetchWorkstations()
  } catch {
    /* 办公位选项加载失败：编辑弹窗办公位树为空，不影响详情展示 */
  }
})
</script>

<template>
  <div class="lease-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="goBack">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <!-- 租约编号统一在下方 descriptions 展示，页头标题不再重复同一 ID -->
    <PageHeader title="租赁详情" description="租约基础信息、办公位归属与联系人">
      <template #actions>
        <t-tag v-if="isArchived" theme="default" variant="light">已归档</t-tag>
        <t-button v-if="lease" variant="outline" @click="openPrint">打印租约</t-button>
        <template v-if="lease && !isArchived">
          <!-- 续期：生效中/即将到期/已到期（长期租约无到期日不可续期） -->
          <t-button v-if="canRenew" theme="primary" @click="openRenew">
            <template #icon><TimeIcon /></template>
            续期
          </t-button>
          <t-button v-if="['active', 'expiring'].includes(viewStatus)" variant="outline" @click="openEdit">
            <template #icon><EditIcon /></template>
            编辑
          </t-button>
          <t-popconfirm
            v-if="canOperate"
            content="确认终止该租约？关联办公位将立即释放"
            @confirm="onTerminate"
          >
            <t-button variant="outline" theme="danger" :loading="acting === 'terminate'">终止</t-button>
          </t-popconfirm>
          <t-popconfirm
            v-if="viewStatus === 'terminated'"
            content="确认归档该租约？归档后可在归档管理中恢复"
            @confirm="onArchive"
          >
            <t-button variant="outline" theme="danger" :loading="acting === 'archive'">归档</t-button>
          </t-popconfirm>
        </template>
      </template>
    </PageHeader>

    <div class="page-card">
      <t-loading :loading="loading">
        <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
        <t-empty v-else-if="!loading && !lease" description="租约不存在或已删除" />
        <template v-else-if="lease">
        <div class="head-row">
          <StatusTag entity="lease" :value="viewStatus" />
          <span v-if="viewStatus === 'terminated' && lease.terminatedAt" class="terminated-at">
            终止于 {{ formatDateOnly(lease.terminatedAt) }}
          </span>
        </div>

        <t-descriptions :column="2" bordered size="medium" class="detail-desc">
          <t-descriptions-item label="租约编号">{{ lease.id }}</t-descriptions-item>
          <t-descriptions-item label="租赁方">
            <t-link
              v-if="(lease.renterType ?? 'custom') !== 'custom'"
              theme="primary"
              hover="color"
              :href="router.resolve((lease.renterType === 'enterprise' ? '/enterprises/' : '/users/') + lease.enterpriseId).href"
            >
              {{ lease.enterpriseName }}<t-tag v-if="lease.enterpriseId" class="id-tag" size="small" variant="light">{{ lease.enterpriseId }}</t-tag>
            </t-link>
            <span v-else>{{ lease.enterpriseName }}<t-tag v-if="lease.enterpriseId" class="id-tag" size="small" variant="light">{{ lease.enterpriseId }}</t-tag></span>
          </t-descriptions-item>
          <t-descriptions-item label="租赁方类型">
            {{ renterTypeMap[lease.renterType ?? 'custom'] }}
          </t-descriptions-item>
          <t-descriptions-item label="租期">{{ termText }}</t-descriptions-item>
          <t-descriptions-item label="租金">
            {{ lease.monthlyRent }} 元 / {{ rentPeriodMap[lease.rentPeriod ?? 'month'] }}
          </t-descriptions-item>
          <t-descriptions-item label="联系人">
            {{ lease.contactName }}（{{ lease.contactPhone }}）
          </t-descriptions-item>
          <t-descriptions-item label="办公位" :span="2">
            <t-tag v-for="label in lease.workstationLabels" :key="label" variant="light" class="ws-tag">
              {{ label }}
            </t-tag>
            <span v-if="!lease.workstationLabels.length" class="muted">—</span>
          </t-descriptions-item>
          <t-descriptions-item label="备注" :span="2">{{ lease.note || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="viewStatus === 'terminated'" label="终止时间" :span="2">
            {{ lease.terminatedAt ?? '—' }}
          </t-descriptions-item>
        </t-descriptions>
      </template>
      </t-loading>
    </div>

    <!-- 选项卡：编辑记录 / 续期记录 / 合同扫描件 -->
    <div v-if="lease" class="page-card record-card">
      <t-tabs v-model="tab">
        <t-tab-panel value="edits" label="编辑记录">
          <t-empty v-if="!lease.editRecords?.length" description="暂无编辑记录" />
          <t-timeline v-else class="record-timeline" mode="same">
            <t-timeline-item v-for="(r, i) in lease.editRecords" :key="i">
              <div class="record-reason">{{ r.reason }}</div>
              <div class="record-meta">{{ r.operator }} · {{ r.at }}</div>
            </t-timeline-item>
          </t-timeline>
        </t-tab-panel>

        <t-tab-panel value="renews" label="续期记录">
          <t-empty v-if="!lease.renewRecords?.length" description="暂无续期记录" />
          <t-timeline v-else class="record-timeline" mode="same">
            <t-timeline-item v-for="(r, i) in lease.renewRecords" :key="i">
              <div class="record-reason">{{ r.reason }}</div>
              <div class="record-term">
                到期日 {{ r.fromEndDate }} → {{ r.toEndDate }}
                <span v-if="r.toRent !== r.fromRent"> · 租金 {{ r.fromRent }} → {{ r.toRent }} 元</span>
              </div>
              <div class="record-meta">{{ r.operator }} · {{ r.at }}</div>
            </t-timeline-item>
          </t-timeline>
        </t-tab-panel>

        <t-tab-panel value="contracts" label="合同">
          <div class="contract-head">
            <div class="contract-tip">
              线下签约的纸质合同可上传照片或 PDF 扫描件（支持 PNG/JPEG/GIF/WebP 与 PDF，单文件大小受系统配置限制）
            </div>
            <t-button v-if="!isArchived" theme="primary" :loading="uploading" @click="pickContractFile">
              <template #icon><UploadIcon /></template>
              上传合同
            </t-button>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              multiple
              class="hidden-file"
              @change="onContractPicked"
            />
          </div>

          <t-loading :loading="contractsLoading">
            <div v-if="contractsError" class="contract-error">
              <span>{{ contractsError }}</span>
              <t-link theme="primary" hover="color" @click="loadContracts">重试</t-link>
            </div>
            <t-empty v-else-if="!contracts.length" description="暂无合同附件" />
            <div v-else class="contract-grid">
              <div v-for="c in contracts" :key="c.id" class="contract-card">
                <a class="contract-preview" :href="c.url" target="_blank" rel="noopener" :title="`查看 ${c.fileName}`">
                  <img v-if="isImage(c)" :src="c.url" :alt="c.fileName" class="contract-thumb" />
                  <span v-else class="contract-doc"><FilePdfFilledIcon />PDF</span>
                </a>
                <div class="contract-meta">
                  <div class="contract-name" :title="c.fileName">{{ c.fileName }}</div>
                  <div class="cell-sub">{{ formatSize(c.size) }} · {{ c.createdAt }}</div>
                </div>
                <div class="contract-ops">
                  <t-link theme="primary" hover="color" :href="c.url" target="_blank" rel="noopener">查看</t-link>
                  <t-popconfirm
                    v-if="!isArchived"
                    content="确认删除该合同附件？删除后不可恢复"
                    @confirm="onRemoveContract(c)"
                  >
                    <t-button variant="text" size="small" theme="danger" :loading="removingId === c.id">删除</t-button>
                  </t-popconfirm>
                </div>
              </div>
            </div>
          </t-loading>
        </t-tab-panel>
      </t-tabs>
    </div>

    <LeaseFormDialog
      v-model:visible="formVisible"
      mode="edit"
      :lease="lease"
      :workstations="workstations"
      @success="load"
    />

    <LeaseRenewDialog v-model:visible="renewVisible" :lease="lease" @success="load" />
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.head-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.terminated-at {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.detail-desc {
  width: 100%;
}

.record-card {
  margin-top: 16px;
}

.record-timeline {
  padding-top: 8px;
}

.record-reason {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

/* 续期记录的租期变化（原到期日 → 新到期日 + 租金变化，如有） */
.record-term {
  margin-top: 2px;
  font-size: 13px;
  line-height: 20px;
  color: var(--td-text-color-primary);
}

.record-meta {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

/* ---------- 合同扫描件 ---------- */

.contract-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.contract-tip {
  flex: 1;
  font-size: 12px;
  line-height: 20px;
  color: var(--td-text-color-secondary);
}

.hidden-file {
  display: none;
}

.contract-error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--td-error-color);
}

.contract-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.contract-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.contract-preview {
  display: block;
  height: 120px;
  overflow: hidden;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-small);
}

.contract-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.contract-doc {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.contract-doc svg {
  font-size: 28px;
}

.contract-meta {
  min-width: 0;
}

.contract-name {
  font-size: 13px;
  line-height: 20px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contract-ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ws-tag {
  margin: 2px 4px 2px 0;
}

.muted {
  color: var(--td-text-color-placeholder);
}
</style>