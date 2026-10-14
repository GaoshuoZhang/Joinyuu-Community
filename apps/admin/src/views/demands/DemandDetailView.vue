<script setup lang="ts">
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab, backOrFallback } from '@/utils/navigation'
import { MessagePlugin, type FormProps } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import DemandPublishDialog from '@/components/DemandPublishDialog.vue'
import DemandReviewDialog from '@/components/DemandReviewDialog.vue'
import DemandScheduleDialog from '@/components/DemandScheduleDialog.vue'
import ContentTakedownDialog from '@/components/ContentTakedownDialog.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import { identityLabelOf, identityTypeMap, userLevelMap } from '@/constants/identity'
import { cancelDemandSchedule, closeDemand, fetchDemand, publishDemandNow, reviewDemandRespondent } from '@/api/demands'
import { isNotFound } from '@/api/http'
import ListErrorState from '@/components/ListErrorState.vue'
import type { Demand, DemandRespondent } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const demand = ref<Demand | null>(null)
const tab = useQueryTab('info', ['info', 'respondents'] as const)
/* 已归档条目：隐藏全部写操作，仅保留只读内容与「查看关联项目」跳转 */
const isArchived = computed(() => !!demand.value?.deletedAt)

const respondentColumns = [
  { colKey: 'name', title: '响应人', width: 120 , ellipsis: true},
  { colKey: 'enterprise', title: '所属', width: 160, ellipsis: true },
  { colKey: 'message', title: '留言' },
  { colKey: 'at', title: '时间', width: 170 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 140 },
  { colKey: 'op', title: '操作', cell: 'op', width: 120 },
]

/* 响应记录以 id 作为稳定行键 */
const respondentRows = computed(() =>
  (demand.value?.respondents ?? []).map((row) => ({ ...row, rowKey: String(row.id) })),
)

/* 留言列附带的审核参考信息：报价/可投入时间/手机，仅拼接存在的项，全空返回空串 */
function respondentMeta(row: DemandRespondent): string {
  const parts: string[] = []
  if (row.quote) parts.push(`报价 ${row.quote}`)
  if (row.timeline) parts.push(`工期 ${row.timeline}`)
  if (row.phone) parts.push(`手机 ${row.phone}`)
  return parts.join(' · ')
}

async function load() {
  loading.value = true
  try {
    demand.value = await fetchDemand(route.params.id as string)
    loadError.value = ''
  } catch (e) {
    /* 404 = 需求不存在（走空态）；其余错误保留原因并展示重试入口 */
    if (isNotFound(e)) {
      demand.value = null
      loadError.value = ''
    } else {
      loadError.value = e instanceof Error ? e.message : '需求加载失败'
    }
  } finally {
    loading.value = false
  }
}

/* 响应审核：仅「待审核」行可操作；通过 = 回待处理，驳回需填理由（必填 ≤200）。
 * 行级互斥：reviewing 记录 `${row.id}:${status}`，同一行同时只允许一个动作在途 */
const reviewing = ref('')

function isReviewing(row: DemandRespondent, status: 'approved' | 'rejected') {
  return reviewing.value === `${row.id}:${status}`
}

async function onApproveRespondent(row: DemandRespondent) {
  if (!demand.value) return
  reviewing.value = `${row.id}:approved`
  try {
    await reviewDemandRespondent(demand.value.id, row.id, { status: 'approved' })
    MessagePlugin.success('已通过该响应')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    reviewing.value = ''
  }
}

const rejectVisible = ref(false)
const rejectRow = ref<DemandRespondent | null>(null)
const rejectFormRef = ref()
const rejectForm = reactive({ reason: '' })
const rejectSubmitting = ref(false)
const rejectRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写驳回理由', trigger: 'submit' }],
}

function openRejectRespondent(row: DemandRespondent) {
  rejectRow.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
  nextTick(() => rejectFormRef.value?.clearValidate())
}

async function onConfirmRejectRespondent() {
  const row = rejectRow.value
  if (!row || !demand.value) return
  const valid = await rejectFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(rejectFormRef.value)
  rejectSubmitting.value = true
  try {
    await reviewDemandRespondent(demand.value.id, row.id, { status: 'rejected', reason: rejectForm.reason })
    MessagePlugin.success('已驳回该响应')
    rejectVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    rejectSubmitting.value = false
  }
}

/* 编辑（待发布/已发布） */
const publishVisible = ref(false)
const publishMode = ref<'edit'>('edit')

function openEdit() {
  publishMode.value = 'edit'
  publishVisible.value = true
}

/* 待审核 → 只读审核对话框 */
const reviewVisible = ref(false)

function openReview() {
  reviewVisible.value = true
}

/* 待发布 → 定时发布对话框 */
const scheduleVisible = ref(false)

function openSchedule() {
  scheduleVisible.value = true
}

/* 待发布 → 立即发布 */
const publishing = ref(false)

async function onPublishNow() {
  if (!demand.value) return
  publishing.value = true
  try {
    await publishDemandNow(demand.value.id)
    MessagePlugin.success('需求已发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    publishing.value = false
  }
}

/* 定时发布中 → 取消定时发布，转回待发布 */
const cancelScheduling = ref(false)

async function onCancelSchedule() {
  if (!demand.value) return
  cancelScheduling.value = true
  try {
    await cancelDemandSchedule(demand.value.id)
    MessagePlugin.success('已取消定时发布，需求转入待发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    cancelScheduling.value = false
  }
}

/* 已发布 → 撤回发布，转回待发布 */
const takedownDialog = ref<InstanceType<typeof ContentTakedownDialog>>()
function onRetract() {
  if (demand.value) takedownDialog.value?.open('demand', demand.value)
}

/* 关闭 */
const closing = ref(false)

async function onCloseDemand() {
  if (!demand.value) return
  closing.value = true
  try {
    await closeDemand(demand.value.id)
    MessagePlugin.success('已关闭该需求')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    closing.value = false
  }
}

/* 立项 */
const projectVisible = ref(false)

/* 提交人跳转：个人/社区个体 → 用户详情；社区企业 → 社区企业详情；合作企业 → 合作企业详情；自定义不跳 */
function publisherLinkTarget(d: Demand): string | null {
  if (d.publisherId.startsWith('U')) return '/users/' + d.publisherId
  if (d.publisherId.startsWith('XE')) return '/external-enterprises/' + d.publisherId
  if (d.publisherId.startsWith('E')) return '/enterprises/' + d.publisherId
  return null
}

/* 链接跳转（t-link 禁用态不触发 click，此处再兜底判空） */
function goTarget(target: string | null) {
  if (target) router.push(target)
}


/* 提交人身份快照 → 标签文字（社区官方显示工作人员角色名；企业仅显示 社区企业/合作企业，不追加成员标题） */
function publisherIdentityLabel(d: Demand): string {
  return identityLabelOf(d.publisherIdentity)
}

/* 身份标签主题：与需求列表口径一致（社区身份 primary，其余 default） */
function publisherIdentityTheme(d: Demand): 'default' | 'primary' {
  const t = d.publisherIdentity?.type
  return t === 'official' || t === 'community_enterprise' || t === 'community_individual' ? 'primary' : 'default'
}
function goProject() {
  if (demand.value?.projectId) router.push(`/projects/${demand.value.projectId}`)
}

onMounted(load)
const { close: closeRejectDialog } = useDialogFormProtection(rejectForm, rejectVisible, rejectSubmitting)
</script>

<template>
  <div class="demand-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="backOrFallback(router, '/demands')">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '180px' }, { width: '100%', height: '360px' }]"
      animation="gradient"
    />

    <ListErrorState v-else-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <t-empty v-else-if="!demand" description="需求不存在或已被删除" />

    <template v-else>
      <!-- 需求头部 -->
      <div class="page-card head-card">
        <div class="head-main">
          <div class="head-info">
            <div class="head-title">
              <h3 class="head-name">{{ demand.title }}</h3>
              <StatusTag entity="demand" :value="demand.status" :scheduled-at="demand.scheduledAt" />
              <t-tag v-if="isArchived" theme="default" variant="light">已归档</t-tag>
              <t-tag variant="light">{{ demand.categoryLabel ?? demand.category }}</t-tag>
            </div>
            <!-- 可见范围与可报名范围同行展示 -->
            <div class="scope-row">
              <div class="visibility-row">
                <span class="vis-label">可见范围</span>
                <template v-if="demand.visibilityIdentities.length">
                  <t-tag v-for="t in demand.visibilityIdentities" :key="t" variant="light" size="small">
                    {{ identityTypeMap[t] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">身份不限</t-tag>
                <template v-if="demand.visibilityLevels.length">
                  <t-tag v-for="l in demand.visibilityLevels" :key="l" variant="light" size="small">
                    {{ userLevelMap[l] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">等级不限</t-tag>
              </div>
              <span class="scope-divider"></span>
              <div class="visibility-row">
                <span class="vis-label">可报名范围</span>
                <template v-if="demand.enrollmentIdentities.length">
                  <t-tag v-for="t in demand.enrollmentIdentities" :key="t" variant="light" size="small">
                    {{ identityTypeMap[t] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">身份不限</t-tag>
                <template v-if="demand.enrollmentLevels.length">
                  <t-tag v-for="l in demand.enrollmentLevels" :key="l" variant="light" size="small">
                    {{ userLevelMap[l] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">等级不限</t-tag>
              </div>
            </div>
          </div>
          <div class="head-actions">
            <template v-if="!isArchived">
              <template v-if="demand.status === 'pending'">
                <t-button theme="primary" @click="openReview">审核</t-button>
              </template>
              <template v-else-if="demand.status === 'pending_release'">
                <t-popconfirm
                  :content="`确认立即发布「${demand.title}」？发布后成员即可响应`"
                  confirm-btn="立即发布"
                  @confirm="onPublishNow"
                >
                  <t-button theme="primary" :loading="publishing">立即发布</t-button>
                </t-popconfirm>
                <t-button variant="outline" @click="openSchedule">定时发布</t-button>
                <t-button variant="outline" @click="openEdit">编辑</t-button>
                <t-popconfirm
                  :content="`确认关闭该需求「${demand.title}」？`"
                  :confirm-btn="{ content: '关闭', theme: 'danger' }"
                  @confirm="onCloseDemand"
                >
                  <t-button variant="outline" theme="danger" :loading="closing">关闭</t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="demand.status === 'scheduled'">
                <t-popconfirm
                  :content="`确认取消「${demand.title}」的定时发布？该需求将转为「待发布」`"
                  confirm-btn="取消定时发布"
                  @confirm="onCancelSchedule"
                >
                  <t-button variant="outline" theme="warning" :loading="cancelScheduling">取消定时发布</t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="demand.status === 'selected'">
                <t-button theme="primary" title="将基于该需求创建项目并建立关联，可在项目管理中跟进" @click="projectVisible = true">立项</t-button>
              </template>
              <template v-else-if="demand.status === 'published'">
                <t-button theme="primary" title="将基于该需求创建项目并建立关联，可在项目管理中跟进" @click="projectVisible = true">立项</t-button>
                <t-button variant="outline" theme="warning" @click="onRetract">撤回发布</t-button>
                <t-popconfirm
                  :content="`确认关闭该需求「${demand.title}」？`"
                  :confirm-btn="{ content: '关闭', theme: 'danger' }"
                  @confirm="onCloseDemand"
                >
                  <t-button variant="outline" theme="danger" :loading="closing">关闭</t-button>
                </t-popconfirm>
              </template>
            </template>
            <t-button v-if="demand.status === 'projected'" variant="outline" @click="goProject">
              查看关联项目
            </t-button>
          </div>
        </div>

        <t-descriptions :column="2" bordered class="head-desc">
          <t-descriptions-item label="编号">{{ demand.id }}</t-descriptions-item>
          <t-descriptions-item label="提交人">
            <t-link theme="default" hover="color" :disabled="!publisherLinkTarget(demand)"
              class="publisher-link"
              :class="{ clickable: publisherLinkTarget(demand) }"
              @click="goTarget(publisherLinkTarget(demand))"
            >
              {{ demand.publisherName }}<t-tag v-if="demand.publisherId" class="id-tag" size="small" variant="light">{{ demand.publisherId }}</t-tag>
            </t-link>
          </t-descriptions-item>
          <t-descriptions-item label="提交人身份">
            <t-tag size="small" :theme="publisherIdentityTheme(demand)" variant="light">{{ publisherIdentityLabel(demand) }}</t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="联系人">{{ demand.contactName ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ demand.contactPhone ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系邮箱">{{ demand.contactEmail ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="公开联系人">{{ demand.contactPublic ? '已开启（客户端可见）' : '未开启（客户端不可见）' }}</t-descriptions-item>
          <t-descriptions-item label="预算">{{ demand.budget || '—' }}</t-descriptions-item>
          <t-descriptions-item label="需求类型">
            {{ demand.demandType === 'investment' ? '找投资' : demand.demandType === 'cooperation' ? '找合作' : '找服务' }}
          </t-descriptions-item>
          <t-descriptions-item v-if="demand.demandType === 'task'" label="预期交付内容">{{ demand.deliverable || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.demandType === 'task'" label="预期交付日期">{{ demand.deliverBy || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.demandType === 'investment'" label="合作需求">{{ demand.cooperationNeed || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.demandType === 'investment'" label="可提供回报">{{ demand.returnOffer || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.demandType === 'cooperation'" label="业务瓶颈">{{ demand.bottleneck || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.demandType === 'cooperation'" label="期望合作方式">{{ demand.partnershipMode || '—' }}</t-descriptions-item>
          <t-descriptions-item label="预期交付截止日">{{ demand.period || '—' }}</t-descriptions-item>
          <t-descriptions-item label="报名截止时间">{{ demand.deadline || '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.status === 'scheduled' && demand.scheduledAt" label="定时发布时间">
            {{ demand.scheduledAt }}（到点自动发布）
          </t-descriptions-item>
          <t-descriptions-item label="创建时间">{{ demand.createdAt }}</t-descriptions-item>
          <t-descriptions-item label="发布时间">{{ demand.publishedAt ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="响应数">{{ demand.responseCount }}</t-descriptions-item>
          <t-descriptions-item v-if="demand.matchedRespondent" label="匹配响应方">
            {{ demand.matchedRespondent }}
          </t-descriptions-item>
        </t-descriptions>

        <t-alert
          v-if="demand.status === 'rejected' && demand.rejectedReason"
          class="head-alert"
          theme="error"
          title="驳回原因"
          :message="demand.rejectedReason"
        />
      </div>

      <!-- 详情 / 响应记录 -->
      <div class="page-card">
        <t-tabs v-model="tab">
          <t-tab-panel value="info" label="需求详情">
            <div class="tab-body">
              <t-alert
                v-if="demand.status === 'pending'"
                class="block-gap"
                theme="info"
                title="审核提示"
                message="该需求为只读审核，审核通过后转入「待发布」，由运营决定发布时间；如需修改内容请联系提交人重新提交。"
              />
              <div class="desc-text rich-text" v-html="demand.description"></div>
              <div v-if="demand.tags.length" class="tags-row">
                <t-tag v-for="tag in demand.tags" :key="tag" variant="outline" size="small">{{ tag }}</t-tag>
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel value="respondents" label="响应记录">
            <div class="tab-body">
              <t-alert
                v-if="demand.pendingResponseCount > 0"
                class="block-gap"
                theme="info"
                message="待审核响应需管理员审核通过后才对发布者可见"
              />
              <t-table
                row-key="rowKey"
                :data="respondentRows"
                :columns="respondentColumns"
                empty="暂无响应记录，需求发布后成员可在此报名响应"
              >
                <template #message="{ row }">
                  <div class="resp-message-cell">
                    <div class="resp-message-text" :title="row.message">{{ row.message }}</div>
                    <div v-if="respondentMeta(row)" class="resp-meta-text">{{ respondentMeta(row) }}</div>
                    <div v-if="row.cases" class="resp-cases-text" :title="row.cases">案例：{{ row.cases }}</div>
                  </div>
                </template>
                <template #status="{ row }">
                  <div class="resp-status-cell">
                    <StatusTag entity="demandRespondent" :value="row.status" />
                    <span
                      v-if="row.status === 'rejected' && row.rejectReason"
                      class="resp-reject-reason"
                      :title="row.rejectReason"
                    >
                      {{ row.rejectReason }}
                    </span>
                  </div>
                </template>
                <template #op="{ row }">
                  <div v-if="!isArchived && row.status === 'pending_review'" class="op-cell" @click.stop>
                    <t-popconfirm
                      :content="`确认通过 ${row.name} 的响应？通过后发布者可看到并选定该响应`"
                      confirm-btn="通过"
                      @confirm="onApproveRespondent(row)"
                    >
                      <t-button variant="text" size="small" theme="primary" :loading="isReviewing(row, 'approved')">通过</t-button>
                    </t-popconfirm>
                    <t-button variant="text" size="small" theme="danger" :disabled="isReviewing(row, 'approved')" @click="openRejectRespondent(row)">驳回</t-button>
                  </div>
                </template>
              </t-table>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <!-- 完成并发布 / 编辑弹窗 -->
    <DemandPublishDialog v-model:visible="publishVisible" :mode="publishMode" :demand="demand" @success="load" />

    <!-- 待审核：只读审核对话框 -->
    <DemandReviewDialog v-model:visible="reviewVisible" :demand="demand" @success="load" />

    <!-- 待发布：定时发布对话框 -->
    <DemandScheduleDialog v-model:visible="scheduleVisible" :demand="demand" @success="load" />
    <ContentTakedownDialog ref="takedownDialog" @success="load" />

    <!-- 立项弹窗 -->
    <ProjectFormDialog v-model:visible="projectVisible" mode="create" :demand="demand" :project="null" @success="load" />

    <!-- 驳回响应：理由必填（≤200），驳回后该记录失效、响应者可重新响应 -->
    <t-dialog
      :visible="rejectVisible" @close="closeRejectDialog"
      header="驳回响应"
      width="480px"
      :close-on-overlay-click="!rejectSubmitting"
      :confirm-btn="{ content: '确认驳回', theme: 'danger', loading: rejectSubmitting }"
      cancel-btn="取消"
      @confirm="onConfirmRejectRespondent"
    >
      <p class="reject-tip">
        {{ rejectRow ? `驳回 ${rejectRow.name} 的响应` : '' }}理由将记录在该响应上，驳回后该记录失效、响应者可重新响应。
      </p>
      <t-form ref="rejectFormRef" :data="rejectForm" :rules="rejectRules">
        <t-form-item label="驳回原因" name="reason">
          <t-textarea
            v-accessible-field
            v-model="rejectForm.reason"
            :maxlength="200"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请填写驳回理由（必填，最多 200 字）…"
          />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.head-card {
  margin-bottom: 16px;
}

.head-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.head-info {
  min-width: 0;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.head-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--td-text-color-primary);
}

.visibility-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* 可见范围与可报名范围同行容器 */
.scope-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.scope-divider {
  width: 1px;
  height: 14px;
  background: var(--td-component-border);
}

.vis-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.head-desc {
  margin-bottom: 0;
}

.head-alert {
  margin-top: 16px;
}

.tab-body {
  padding-top: 16px;
}

.block-gap {
  margin-bottom: 16px;
}

.desc-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.tags-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}
.publisher-link.clickable {
  cursor: pointer;
  color: var(--td-brand-color);
}

.publisher-link.clickable:hover {
  text-decoration: underline;
}

/* 响应记录留言单元格：留言 + 审核参考小字（报价/工期/手机/案例），逐行 CSS 截断并可悬停看全文 */
.resp-message-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.resp-message-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resp-meta-text,
.resp-cases-text {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

/* 响应记录状态单元格：标签 + 驳回理由（小字，超长省略，悬停看全文） */
.resp-status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.resp-reject-reason {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.reject-tip {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}
</style>
