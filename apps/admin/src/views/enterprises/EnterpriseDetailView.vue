<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import AdjustValueDialog from '@/components/AdjustValueDialog.vue'
import { roleLabelMap } from '@/constants/identity'
import { fetchEnterprise, fetchEnterpriseStats, reviewShowcase, type EnterpriseStats } from '@/api/enterprises'
import { adjustExperience, fetchExperienceRecords } from '@/api/ledgers'
import type { Enterprise, ExperienceRecord, User, UserIdentity } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const enterprise = ref<Enterprise | null>(null)
const members = ref<User[]>([])
const tab = ref('info')

const rejectVisible = ref(false)
const rejectComment = ref('')
const submitting = ref(false)

/* 数据概览 */
const stats = ref<EnterpriseStats | null>(null)

/* 经验值 */
const experienceRecords = ref<ExperienceRecord[]>([])
const recordsLoading = ref(false)
const adjustVisible = ref(false)
const adjusting = ref(false)

const experienceColumns = [
  { colKey: 'at', title: '时间', width: 150 },
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90 },
  { colKey: 'balance', title: '余额', width: 90 },
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'operator', title: '操作人', width: 100 },
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
  { colKey: 'name', title: '成员', cell: 'member' },
  { colKey: 'title', title: '职位', cell: 'title' },
  { colKey: 'role', title: '角色', cell: 'role', width: 110 },
  { colKey: 'phone', title: '手机号', width: 140 },
  { colKey: 'status', title: '账号状态', cell: 'status', width: 110 },
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
 * 跳转参数携带企业 ID（外部企业以名称为唯一标识），避免同名歧义 */
function goDemands() {
  if (!enterprise.value || !stats.value || stats.value.demandCount === 0) return
  router.push({ path: '/demands', query: { enterprise: enterprise.value.id } })
}

function goProjects() {
  if (!enterprise.value || !stats.value || stats.value.projectCount === 0) return
  router.push({ path: '/projects', query: { enterprise: enterprise.value.id } })
}

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

onMounted(load)
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
            <div class="head-tags">
              <t-tag variant="outline" size="small">企业ID: {{ enterprise.id }}</t-tag>
              <t-tag v-for="tag in enterprise.tags" :key="tag" variant="outline" size="small">{{ tag }}</t-tag>
            </div>
          </div>
        </div>
        <div v-if="enterprise.showcaseStatus === 'pending'" class="head-actions">
          <t-button theme="primary" :loading="submitting" @click="onApprove">通过发布</t-button>
          <t-button variant="outline" :loading="submitting" @click="openReject">驳回</t-button>
        </div>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <!-- 企业信息 -->
          <t-tab-panel value="info" label="企业信息">
            <div class="tab-body">
              <t-descriptions :column="2" bordered>
                <t-descriptions-item label="行业">{{ enterprise.industry }}</t-descriptions-item>
                <t-descriptions-item label="发展阶段">{{ enterprise.stage }}</t-descriptions-item>
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

          <!-- 数据概览 -->
          <t-tab-panel value="stats" label="数据概览">
            <div class="tab-body">
              <div class="stats-grid">
                <div
                  class="stat-item"
                  :class="{ clickable: (stats?.demandCount ?? 0) > 0 }"
                  @click="goDemands"
                >
                  <span class="stat-num">{{ stats?.demandCount ?? 0 }}</span>
                  <span class="stat-label">需求发布</span>
                </div>
                <div
                  class="stat-item"
                  :class="{ clickable: (stats?.projectCount ?? 0) > 0 }"
                  @click="goProjects"
                >
                  <span class="stat-num">{{ stats?.projectCount ?? 0 }}</span>
                  <span class="stat-label">参与项目</span>
                </div>
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
                @row-click="({ row }) => router.push('/users/' + row.id)"
              >
                <template #member="{ row }">
                  <div class="member-cell">
                    <span class="member-name">{{ row.name }}</span>
                    <span class="member-id">{{ row.id }}</span>
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

    <t-empty v-else description="企业不存在或已被删除" />

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
        placeholder="驳回原因（必填）"
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
  </div>
</template>

<style scoped>
.back-row {
  margin-bottom: 12px;
}

.head-card {
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

.member-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
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
  border-radius: 6px;
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
</style>
