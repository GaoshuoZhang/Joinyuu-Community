<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab } from '@/utils/navigation'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import DemandPublishDialog from '@/components/DemandPublishDialog.vue'
import DemandReviewDialog from '@/components/DemandReviewDialog.vue'
import DemandScheduleDialog from '@/components/DemandScheduleDialog.vue'
import ContentTakedownDialog from '@/components/ContentTakedownDialog.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import { identityTypeMap, userLevelMap } from '@/constants/identity'
import { cancelDemandSchedule, closeDemand, fetchDemand, publishDemandNow } from '@/api/demands'
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

const respondentStatusMap: Record<DemandRespondent['status'], { label: string; theme: 'warning' | 'success' | 'default' }> = {
  pending: { label: '待回应', theme: 'warning' },
  contacted: { label: '已对接', theme: 'success' },
  accepted: { label: '已接受', theme: 'success' },
  rejected: { label: '已拒绝', theme: 'default' },
  closed: { label: '已结束', theme: 'default' },
}

const respondentColumns = [
  { colKey: 'name', title: '响应人', width: 120 , ellipsis: true},
  { colKey: 'enterprise', title: '所属', width: 160, ellipsis: true },
  { colKey: 'message', title: '留言', ellipsis: true },
  { colKey: 'at', title: '时间', width: 150 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 100 , ellipsis: true},
]

/* 响应记录无唯一字段，按「响应人 + 序号」合成稳定行键，避免同名响应人键冲突 */
const respondentRows = computed(() =>
  (demand.value?.respondents ?? []).map((row, index) => ({ ...row, rowKey: `${row.name}-${index}` })),
)

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

/* 创建人跳转：创建人为注册用户（U 前缀）时 → 用户详情，其余（管理员代建等）不跳 */
function creatorLinkTarget(d: Demand): string | null {
  if (d.creatorId && d.creatorId.startsWith('U')) return `/users/${d.creatorId}`
  return null
}

/* 链接跳转（t-link 禁用态不触发 click，此处再兜底判空） */
function goTarget(target: string | null) {
  if (target) router.push(target)
}


/* 需求方身份快照 → 纯文本标签（企业仅显示 社区企业/合作企业，不追加成员标题） */
function publisherIdentityLabel(d: Demand): string {
  const type = d.publisherIdentity?.type
  if (!type) return '—'
  return identityTypeMap[type] ?? '—'
}
function goProject() {
  if (demand.value?.projectId) router.push(`/projects/${demand.value.projectId}`)
}

onMounted(load)
</script>

<template>
  <div class="demand-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="router.back()">
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
                <t-button theme="primary" :loading="publishing" @click="onPublishNow">立即发布</t-button>
                <t-button variant="outline" @click="openSchedule">定时发布</t-button>
                <t-button variant="outline" @click="openEdit">编辑</t-button>
                <t-popconfirm content="确认关闭该需求？" @confirm="onCloseDemand">
                  <t-button variant="outline" theme="danger" :loading="closing">关闭</t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="demand.status === 'scheduled'">
                <t-popconfirm
                  content="确认取消定时发布？该需求将转为「待发布」"
                  @confirm="onCancelSchedule"
                >
                  <t-button variant="outline" theme="warning" :loading="cancelScheduling">取消定时发布</t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="demand.status === 'selected'">
                <t-button theme="primary" @click="projectVisible = true">立项</t-button>
              </template>
              <template v-else-if="demand.status === 'published'">
                <t-button theme="primary" @click="projectVisible = true">立项</t-button>
                <t-button variant="outline" theme="warning" @click="onRetract">撤回发布</t-button>
                <t-popconfirm content="确认关闭该需求？" @confirm="onCloseDemand">
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
          <t-descriptions-item label="需求方">
            <t-link theme="default" hover="color" :disabled="!publisherLinkTarget(demand)"
              class="publisher-link"
              :class="{ clickable: publisherLinkTarget(demand) }"
              @click="goTarget(publisherLinkTarget(demand))"
            >
              {{ demand.publisherName }}<t-tag v-if="demand.publisherId" class="id-tag" size="small" variant="light">{{ demand.publisherId }}</t-tag>
            </t-link>
          </t-descriptions-item>
          <t-descriptions-item label="创建人">
            <t-link theme="default" hover="color" :disabled="!creatorLinkTarget(demand)"
              class="publisher-link"
              :class="{ clickable: creatorLinkTarget(demand) }"
              @click="goTarget(creatorLinkTarget(demand))"
            >
              {{ demand.creatorName || '—' }}<t-tag v-if="demand.creatorId" class="id-tag" size="small" variant="light">{{ demand.creatorId }}</t-tag>
            </t-link>
          </t-descriptions-item>
          <t-descriptions-item label="需求方身份">
            <span>{{ publisherIdentityLabel(demand) }}</span>
          </t-descriptions-item>
          <t-descriptions-item label="联系人">{{ demand.contactName ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ demand.contactPhone ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系邮箱">{{ demand.contactEmail ?? '—' }}</t-descriptions-item>
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
          <t-descriptions-item label="响应数">{{ demand.respondents.length }}</t-descriptions-item>
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
              <t-table
                row-key="rowKey"
                :data="respondentRows"
                :columns="respondentColumns"
                empty="暂无响应记录"
              >
                <template #status="{ row }">
                  <t-tag variant="light" :theme="respondentStatusMap[row.status as DemandRespondent['status']].theme">
                    {{ respondentStatusMap[row.status as DemandRespondent['status']].label }}
                  </t-tag>
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
</style>
