<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import DemandPublishDialog from '@/components/DemandPublishDialog.vue'
import DemandReviewDialog from '@/components/DemandReviewDialog.vue'
import DemandScheduleDialog from '@/components/DemandScheduleDialog.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import { identityTypeMap, userLevelMap } from '@/constants/identity'
import { cancelDemandSchedule, closeDemand, fetchDemand, publishDemandNow } from '@/api/demands'
import type { Demand, DemandRespondent } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const demand = ref<Demand | null>(null)
const tab = ref('info')

const respondentStatusMap: Record<DemandRespondent['status'], { label: string; theme: 'warning' | 'success' | 'default' }> = {
  pending: { label: '待回应', theme: 'warning' },
  contacted: { label: '已对接', theme: 'success' },
  closed: { label: '已结束', theme: 'default' },
}

const respondentColumns = [
  { colKey: 'name', title: '响应人', width: 120 },
  { colKey: 'enterprise', title: '所属', width: 160, ellipsis: true },
  { colKey: 'message', title: '留言', ellipsis: true },
  { colKey: 'at', title: '时间', width: 150 },
  { colKey: 'status', title: '状态', cell: 'status', width: 100 },
]

async function load() {
  loading.value = true
  try {
    demand.value = await fetchDemand(route.params.id as string)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '需求加载失败')
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
const retracting = ref(false)

async function onRetract() {
  if (!demand.value) return
  retracting.value = true
  try {
    await retractDemand(demand.value.id)
    MessagePlugin.success('已撤回发布，需求转入待发布')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    retracting.value = false
  }
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

    <t-empty v-else-if="!demand" description="需求不存在或已被删除" />

    <template v-else>
      <!-- 需求头部 -->
      <div class="page-card head-card">
        <div class="head-main">
          <div class="head-info">
            <div class="head-title">
              <span class="head-name">{{ demand.title }}</span>
              <StatusTag entity="demand" :value="demand.status" :scheduled-at="demand.scheduledAt" />
              <t-tag variant="light">{{ demand.category }}</t-tag>
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
            <template v-if="demand.status === 'pending'">
              <t-button theme="primary" @click="openReview">审核</t-button>
            </template>
            <template v-else-if="demand.status === 'pending_release'">
              <t-button theme="primary" :loading="publishing" @click="onPublishNow">立即发布</t-button>
              <t-button variant="outline" @click="openSchedule">定时发布</t-button>
              <t-button variant="outline" @click="openEdit">编辑</t-button>
              <t-button variant="outline" theme="danger" :loading="closing" @click="onCloseDemand">关闭</t-button>
            </template>
            <template v-else-if="demand.status === 'scheduled'">
              <t-popconfirm
                content="确认取消定时发布？该需求将转为「待发布」"
                @confirm="onCancelSchedule"
              >
                <t-button variant="outline" theme="warning" :loading="cancelScheduling">取消定时发布</t-button>
              </t-popconfirm>
            </template>
            <template v-else-if="demand.status === 'published'">
              <t-button theme="primary" @click="projectVisible = true">立项</t-button>
              <t-popconfirm content="确认撤回发布？需求将转为「待发布」" @confirm="onRetract">
                <t-button variant="outline" theme="warning" :loading="retracting">撤回发布</t-button>
              </t-popconfirm>
              <t-button variant="outline" theme="danger" :loading="closing" @click="onCloseDemand">关闭</t-button>
            </template>
            <t-button v-else-if="demand.status === 'projected'" variant="outline" @click="goProject">
              查看关联项目
            </t-button>
          </div>
        </div>

        <t-descriptions :column="2" bordered class="head-desc">
          <t-descriptions-item label="编号">{{ demand.id }}</t-descriptions-item>
          <t-descriptions-item label="提交人">
            {{ demand.publisherName }}（{{ demand.publisherId }}）
          </t-descriptions-item>
          <t-descriptions-item label="提交身份">
            <IdentityTags :identities="demand.publisherIdentity ? [demand.publisherIdentity] : []" />
          </t-descriptions-item>
          <t-descriptions-item label="预算">{{ demand.budget }}</t-descriptions-item>
          <t-descriptions-item label="项目周期">{{ demand.period }}</t-descriptions-item>
          <t-descriptions-item label="报名截止时间">{{ demand.deadline }}</t-descriptions-item>
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
              <p class="desc-text">{{ demand.description }}</p>
              <div v-if="demand.tags.length" class="tags-row">
                <t-tag v-for="tag in demand.tags" :key="tag" variant="outline" size="small">{{ tag }}</t-tag>
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel value="respondents" label="响应记录">
            <div class="tab-body">
              <t-table
                row-key="name"
                :data="demand.respondents"
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

    <!-- 立项弹窗 -->
    <ProjectFormDialog v-model:visible="projectVisible" :demand="demand" @success="load" />
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
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
  color: var(--td-text-color-primary);
}

.visibility-row {
  display: flex;
  align-items: center;
  gap: 6px;
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
</style>
