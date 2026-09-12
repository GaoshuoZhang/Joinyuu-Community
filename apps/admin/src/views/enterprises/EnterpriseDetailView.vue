<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab } from '@/utils/navigation'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon, EditIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import AdjustValueDialog from '@/components/AdjustValueDialog.vue'
import EnterpriseFormDialog from '@/components/EnterpriseFormDialog.vue'
import { roleLabelMap } from '@/constants/identity'
import {
  deleteEnterprise,
  disableEnterprise,
  enableEnterprise,
  fetchEnterprise,
  fetchEnterpriseStats,
  reviewShowcase,
  type EnterpriseStats,
} from '@/api/enterprises'
import { adjustExperience, fetchExperienceRecords } from '@/api/ledgers'
import { deriveLeaseStatus, fetchLeases, type LeaseViewStatus } from '@/api/workstations'
import type { Enterprise, ExperienceRecord, Lease, User, UserIdentity } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const enterprise = ref<Enterprise | null>(null)
const members = ref<User[]>([])
const tab = useQueryTab('info', ['info', 'leases', 'stats', 'members', 'experience', 'showcase'] as const)

const rejectVisible = ref(false)
const rejectComment = ref('')
const submitting = ref(false)

/* 编辑弹窗 */
const editVisible = ref(false)
const acting = ref('')

/* 数据概览 */
const stats = ref<EnterpriseStats | null>(null)

/* 经验值 */
const experienceRecords = ref<ExperienceRecord[]>([])
const recordsLoading = ref(false)
const adjustVisible = ref(false)
const adjusting = ref(false)

/* 关联租赁 */
const leases = ref<Lease[]>([])
const leasesLoading = ref(false)

const enterpriseLeases = computed(() =>
  leases.value.filter((l) => l.renterType === 'enterprise' && l.enterpriseId === enterprise.value?.id),
)

const leaseColumns = [
  { colKey: 'id', title: '租约编号', width: 110 , ellipsis: true},
  { colKey: 'workstationLabels', title: '办公位', cell: 'workstations', width: 150, resizable: true , ellipsis: true},
  { colKey: 'term', title: '租期', cell: 'term', width: 180, resizable: true , ellipsis: true},
  { colKey: 'monthlyRent', title: '租金（元）', cell: 'rent', width: 110, resizable: true , ellipsis: true},
  { colKey: 'contactName', title: '联系人', cell: 'contact', width: 140, resizable: true , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 110, resizable: true , ellipsis: true},
]

const experienceColumns = [
  { colKey: 'at', title: '时间', width: 150 , ellipsis: true},
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90 , ellipsis: true},
  { colKey: 'balance', title: '余额', width: 90 , ellipsis: true},
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'operator', title: '操作人', width: 100 , ellipsis: true},
]

const stepCurrent = computed(() => {
  switch (enterprise.value?.showcaseStatus) {
    case 'published':
      return 2
    case 'pending':
    case 'rejected':
      return 1
    default:
      return 0
  }
})

const memberColumns = [
  { colKey: 'name', title: '成员', cell: 'member' , ellipsis: true},
  { colKey: 'title', title: '职位', cell: 'title' , ellipsis: true},
  { colKey: 'role', title: '角色', cell: 'role', width: 110 , ellipsis: true},
  { colKey: 'phone', title: '联系电话', width: 140 , ellipsis: true},
  { colKey: 'status', title: '账号状态', cell: 'status', width: 110 , ellipsis: true},
]

async function load() {
  loading.value = true
  try {
    const id = route.params.id as string
    const res = await fetchEnterprise(id)
    enterprise.value = res.enterprise
    members.value = res.members
    stats.value = await fetchEnterpriseStats(id)
    experienceRecords.value = await fetchExperienceRecords('enterprise', id)
  } catch {
    MessagePlugin.error('企业信息加载失败')
  } finally {
    loading.value = false
  }
}

/* 关联租赁：全量租约后按 renterType=enterprise + renterId 过滤（与租约管理页口径一致） */
async function loadLeases() {
  leasesLoading.value = true
  try {
    leases.value = await fetchLeases()
  } finally {
    leasesLoading.value = false
  }
}

function leaseRentLabel(row: Lease) {
  const map: Record<string, string> = { day: '日', week: '周', month: '月', year: '年' }
  return `${row.monthlyRent} / ${map[row.rentPeriod ?? 'month']}`
}

function showLeaseStatus(row: Lease): LeaseViewStatus {
  return deriveLeaseStatus(row)
}

function goLeaseList() {
  if (!enterprise.value) return
  router.push(`/workstations/leases?renterId=${enterprise.value.id}&renterType=enterprise`)
}

/* 编辑 / 停用 / 归档 */
function openEdit() {
  editVisible.value = true
}

async function onDisable() {
  if (!enterprise.value) return
  acting.value = 'disable'
  try {
    await disableEnterprise(enterprise.value.id)
    MessagePlugin.success('企业已停用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onEnable() {
  if (!enterprise.value) return
  acting.value = 'enable'
  try {
    await enableEnterprise(enterprise.value.id)
    MessagePlugin.success('企业已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete() {
  if (!enterprise.value) return
  acting.value = 'delete'
  try {
    await deleteEnterprise(enterprise.value.id)
    MessagePlugin.success('企业已归档')
    router.back()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '归档失败')
  } finally {
    acting.value = ''
  }
}

/* 成员在该企业下的社区企业身份 */
function memberIdentity(member: User): UserIdentity | undefined {
  return member.identities.find((i) => i.type === 'community_enterprise' && i.enterpriseId === enterprise.value?.id)
}

function memberTitle(member: User) {
  return memberIdentity(member)?.title ?? '—'
}

function memberRoleText(member: User) {
  const role = memberIdentity(member)?.role
  return role ? roleLabelMap[role] : '—'
}

/* 数据概览卡片 → 跳转对应列表并按企业 ID 自动筛选（有数据时可点击）
 * 跳转参数携带企业 ID（合作企业以名称为唯一标识），避免同名歧义 */


/* 经验值调整 */
async function onAdjustExperience(delta: number, reason: string) {
  if (!enterprise.value) return
  adjusting.value = true
  try {
    const res = await adjustExperience('enterprise', enterprise.value.id, delta, reason)
    MessagePlugin.success(`已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 经验值，当前余额 ${res.balance}`)
    adjustVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '调整失败')
  } finally {
    adjusting.value = false
  }
}

async function onApprove() {
  if (!enterprise.value) return
  submitting.value = true
  try {
    await reviewShowcase(enterprise.value.id, 'published')
    MessagePlugin.success('展示页已通过发布')
    await load()
  } finally {
    submitting.value = false
  }
}

function openReject() {
  rejectComment.value = ''
  rejectVisible.value = true
}

async function onConfirmReject() {
  if (!enterprise.value) return
  if (!rejectComment.value.trim()) {
    MessagePlugin.warning('请填写驳回原因')
    return
  }
  submitting.value = true
  try {
    await reviewShowcase(enterprise.value.id, 'rejected', rejectComment.value.trim())
    MessagePlugin.success('已驳回展示页申请')
    rejectVisible.value = false
    await load()
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  load()
  loadLeases()
})
</script>

<template>
  <div class="enterprise-detail page-fade-in">
    <div class="back-row">
      <t-button variant="text" @click="router.back()">
        <template #icon><ArrowLeftIcon /></template>
        返回
      </t-button>
    </div>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '132px' }, { width: '100%', height: '360px' }]"
      animation="gradient"
    />

    <template v-else-if="enterprise">
      <!-- 企业头部 -->
      <div class="page-card head-card">
        <div class="head-main">
          <t-avatar size="48px" class="head-avatar">{{ enterprise.name.slice(0, 1) }}</t-avatar>
          <div class="head-info">
            <div class="head-title">
              <span class="head-name">{{ enterprise.name }}</span>
              <StatusTag entity="enterprise" :value="enterprise.status" />
              <StatusTag entity="showcase" :value="enterprise.showcaseStatus" />
            </div>
            <div class="head-id">企业ID: <t-tag class="id-tag" size="small" variant="light">{{ enterprise.id }}</t-tag></div>
            <div class="head-tags">
              <t-tag v-for="tag in enterprise.tags" :key="tag" variant="outline" size="small">{{ tag }}</t-tag>
            </div>
          </div>
        </div>
        <div v-if="enterprise.showcaseStatus === 'pending'" class="head-actions">
          <t-button theme="primary" :loading="submitting" @click="onApprove">通过发布</t-button>
          <t-button variant="outline" :loading="submitting" @click="openReject">驳回</t-button>
        </div>
        <div v-else class="head-actions">
          <t-button variant="outline" v-permission="'perm:enterprise:update'" @click="openEdit">
            <template #icon><EditIcon /></template>
            编辑
          </t-button>
          <t-popconfirm
            v-if="enterprise.status === 'disabled'"
            content="确认启用该企业？启用后恢复为正常状态"
            @confirm="onEnable"
          >
            <t-button
              variant="outline"
              theme="success"
              v-permission="'perm:enterprise:enable'"
              :loading="acting === 'enable'"
            >
              启用
            </t-button>
          </t-popconfirm>
          <t-popconfirm
            v-else
            content="确认停用该企业？停用后不可新增新租约"
            @confirm="onDisable"
          >
            <t-button
              variant="outline"
              v-permission="'perm:enterprise:disable'"
              :loading="acting === 'disable'"
            >
              停用
            </t-button>
          </t-popconfirm>
          <t-popconfirm
            v-if="enterprise.status === 'disabled'"
            content="确认归档该企业？归档后可在归档管理中恢复"
            @confirm="onDelete"
          >
            <t-button
              variant="outline"
              theme="danger"
              v-permission="'perm:enterprise:delete'"
              :loading="acting === 'delete'"
            >
              归档
            </t-button>
          </t-popconfirm>
        </div>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <!-- 企业信息 -->
          <t-tab-panel value="info" label="企业信息">
            <div class="tab-body">
              <t-descriptions :column="2" bordered>
                <t-descriptions-item label="行业">{{ enterprise.industry }}</t-descriptions-item>
                <t-descriptions-item label="团队规模">{{ enterprise.size }}</t-descriptions-item>
                <t-descriptions-item label="成立时间">{{ enterprise.foundedAt }}</t-descriptions-item>
                <t-descriptions-item label="入驻时间">{{ enterprise.settledAt ?? '—' }}</t-descriptions-item>
                <t-descriptions-item label="入驻类型">{{ enterprise.leaseType }}</t-descriptions-item>
                <t-descriptions-item label="联系人">{{ enterprise.contactName }}</t-descriptions-item>
                <t-descriptions-item label="联系电话">{{ enterprise.contactPhone }}</t-descriptions-item>
              </t-descriptions>

              <t-alert
                v-if="enterprise.showcaseStatus === 'rejected' && enterprise.showcaseComment"
                class="block-gap"
                theme="error"
                title="上次驳回原因"
                :message="enterprise.showcaseComment"
              />

              <div class="desc-block">
                <h4 class="block-title">企业简介</h4>
                <p class="desc-text">{{ enterprise.description }}</p>
              </div>
            </div>
          </t-tab-panel>

          <!-- 关联租赁 -->
          <t-tab-panel value="leases" label="关联租赁">
            <div class="tab-body">
              <div class="lease-head">
                <span class="panel-tip">该企业名下的办公位/办公室租约；点击条目跳转租约管理并自动筛选。</span>
                <t-button variant="text" size="small" @click="goLeaseList">前往租约管理</t-button>
              </div>
              <t-table
                row-key="id"
                :data="enterpriseLeases"
                :columns="leaseColumns"
                :loading="leasesLoading"
                empty="该企业暂无关联租约"
                @row-click="goLeaseList"
              >
                <template #workstations="{ row }">
                  <t-tag v-for="label in row.workstationLabels" :key="label" variant="light" class="ws-tag">
                    {{ label }}
                  </t-tag>
                </template>
                <template #term="{ row }">
                  {{ row.longTerm ? `${row.startDate} ~ 长期` : `${row.startDate} ~ ${row.endDate}` }}
                </template>
                <template #rent="{ row }">
                  {{ leaseRentLabel(row) }}
                </template>
                <template #contact="{ row }">
                  <div class="cell-title">{{ row.contactName }}</div>
                  <div class="cell-sub">{{ row.contactPhone }}</div>
                </template>
                <template #status="{ row }">
                  <StatusTag entity="lease" :value="showLeaseStatus(row)" />
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <!-- 数据概览 -->
          <t-tab-panel value="stats" label="数据概览">
            <div class="tab-body">
              <div class="stats-grid">
                <t-link theme="default" hover="color" :href="router.resolve({ path: '/demands', query: { enterprise: enterprise.id } }).href" :disabled="(stats?.demandCount ?? 0) === 0"
                  class="stat-item"
                  :class="{ clickable: (stats?.demandCount ?? 0) > 0 }"
                >
                  <span class="stat-num">{{ stats?.demandCount ?? 0 }}</span>
                  <span class="stat-label">需求发布</span>
                </t-link>
                <t-link theme="default" hover="color" :href="router.resolve({ path: '/projects', query: { enterprise: enterprise.id } }).href" :disabled="(stats?.projectCount ?? 0) === 0"
                  class="stat-item"
                  :class="{ clickable: (stats?.projectCount ?? 0) > 0 }"
                >
                  <span class="stat-num">{{ stats?.projectCount ?? 0 }}</span>
                  <span class="stat-label">参与项目</span>
                </t-link>
              </div>
            </div>
          </t-tab-panel>

          <!-- 成员管理 -->
          <t-tab-panel value="members" label="成员管理">
            <div class="tab-body">
              <t-table
                row-key="id"
                :data="members"
                :columns="memberColumns"
                empty="暂无企业成员"
                @row-click="({ row }) => router.push('/users/' + row.uid)"
              >
                <template #member="{ row }">
                  <div class="member-cell">
                    <span class="member-name">{{ row.realName || row.nickname }}</span>
                    <t-tag class="id-tag-block" size="small" variant="light">{{ row.uid }}</t-tag>
                  </div>
                </template>
                <template #title="{ row }">{{ memberTitle(row) }}</template>
                <template #role="{ row }">
                  <t-tag variant="light">{{ memberRoleText(row) }}</t-tag>
                </template>
                <template #status="{ row }">
                  <StatusTag entity="user" :value="row.status" />
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <!-- 经验值 -->
          <t-tab-panel value="experience" label="经验值">
            <div class="tab-body">
              <div class="exp-head">
                <div class="exp-balance">
                  <span class="exp-label">当前经验值</span>
                  <span class="exp-num">{{ enterprise.experience ?? 0 }}</span>
                </div>
                <t-button theme="primary" @click="adjustVisible = true">调整经验值</t-button>
              </div>
              <t-table
                row-key="id"
                :data="experienceRecords"
                :columns="experienceColumns"
                :loading="recordsLoading"
                empty="暂无经验值流水"
              >
                <template #delta="{ row }">
                  <span :class="row.delta > 0 ? 'delta-add' : 'delta-sub'">
                    {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
                  </span>
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <!-- 展示页审核 -->
          <t-tab-panel value="showcase" label="展示页审核">
            <div class="tab-body showcase-body">
              <t-steps :current="stepCurrent">
                <t-step-item title="未提交" />
                <t-step-item
                  title="待审核"
                  :status="enterprise.showcaseStatus === 'rejected' ? 'error' : undefined"
                />
                <t-step-item title="已发布" />
              </t-steps>

              <t-alert
                v-if="enterprise.showcaseStatus === 'rejected' && enterprise.showcaseComment"
                class="block-gap"
                theme="error"
                title="驳回原因"
                :message="enterprise.showcaseComment"
              />

              <div v-if="enterprise.showcaseStatus === 'pending'" class="step-actions">
                <t-button theme="primary" :loading="submitting" @click="onApprove">通过发布</t-button>
                <t-button variant="outline" :loading="submitting" @click="openReject">驳回</t-button>
              </div>
              <p v-else class="step-tip">当前展示页状态：{{ enterprise.showcaseStatus === 'none' ? '企业尚未提交展示页' : '暂无需处理的审核任务' }}</p>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <t-empty v-else description="企业不存在或已归档" />

    <!-- 驳回原因 -->
    <t-dialog
      v-model:visible="rejectVisible"
      header="展示页审核"
      width="520px"
      :confirm-btn="{ content: '确认驳回', loading: submitting }"
      @confirm="onConfirmReject"
      @close="rejectVisible = false"
    >
      <t-textarea
        v-model="rejectComment"
        placeholder="驳回原因（必填）…"
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
    </t-dialog>

    <!-- 经验值调整 -->
    <AdjustValueDialog
      v-model:visible="adjustVisible"
      :header="`调整经验值 · ${enterprise?.name ?? ''}`"
      balance-label="当前经验值"
      :balance="enterprise?.experience ?? 0"
      :loading="adjusting"
      @submit="onAdjustExperience"
    />

    <!-- 编辑企业 -->
    <EnterpriseFormDialog v-model:visible="editVisible" mode="edit" :enterprise="enterprise" @success="load" />
  </div>
</template>

<style scoped>
.back-row {
  margin-bottom: 12px;
}

.head-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.head-avatar {
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.head-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.head-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.head-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.head-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.tab-body {
  padding-top: 16px;
}

.block-gap {
  margin-top: 16px;
}

.desc-block {
  margin-top: 24px;
}

.block-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.desc-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.member-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  padding-top: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.stat-item.clickable {
  cursor: pointer;
  transition: border-color 120ms ease;
}

.stat-item.clickable:hover {
  border-color: var(--td-brand-color);
}

.stat-num {
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.exp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.exp-balance {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exp-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.exp-num {
  font-size: 20px;
  font-weight: 600;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.delta-add {
  color: var(--td-success-color);
  font-weight: 600;
}

.delta-sub {
  color: var(--td-error-color);
  font-weight: 600;
}

.showcase-body {
  max-width: 640px;
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
}

.step-tip {
  margin: 24px 0 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.lease-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ws-tag {
  margin: 2px 4px 2px 0;
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
