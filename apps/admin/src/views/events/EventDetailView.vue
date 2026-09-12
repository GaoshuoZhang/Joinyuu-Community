<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab } from '@/utils/navigation'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import EventFormDialog from '@/components/EventFormDialog.vue'
import EventScheduleDialog from '@/components/EventScheduleDialog.vue'
import { identityTypeMap, userLevelMap } from '@/constants/identity'
import {
  archiveEvent,
  cancelEvent,
  cancelEventSchedule,
  checkInEvent,
  fetchEvent,
  publishEventNow,
  restoreCancelledEvent,
  reviewEventEnrollment,
  toggleEventEnrollment,
} from '@/api/events'
import type { CommunityEvent, EventEnrollment } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const event = ref<CommunityEvent | null>(null)
const tab = useQueryTab('info', ['info', 'enrollments', 'checkin'] as const)
/* 已归档条目：隐藏全部写操作（含报名审核/签到），仅保留只读内容 */
const isArchived = computed(() => !!event.value?.deletedAt)
/* 当前审核中的记录标识：`${userId}:${approved | rejected}` */
const reviewing = ref('')
/* 当前手动签到中的用户标识 */
const checkingIn = ref('')
/* 编辑弹窗 */
const editVisible = ref(false)

/* 操作中的标识 */
const acting = ref('')

/* 待发布 → 立即发布（开放报名） */
async function onPublishNow() {
  if (!event.value) return
  acting.value = 'publish-now'
  try {
    await publishEventNow(event.value.id)
    MessagePlugin.success('活动已发布，开放报名')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 定时发布中 → 取消定时发布，转回待发布 */
async function onCancelSchedule() {
  if (!event.value) return
  acting.value = 'cancel-schedule'
  try {
    await cancelEventSchedule(event.value.id)
    MessagePlugin.success('已取消定时发布，活动转入待发布')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已发布 → 暂停报名 / 开放报名 */
async function onToggleEnrollment() {
  if (!event.value) return
  acting.value = 'enrollment'
  /* 先取旧状态再调接口：接口原地翻转了 enrollmentOpen，后再判断会拿到新值导致提示反转 */
  const wasOpen = event.value.enrollmentOpen
  try {
    await toggleEventEnrollment(event.value.id)
    MessagePlugin.success(wasOpen ? '已暂停报名' : '已开放报名')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 待发布 / 已发布 → 取消活动 */
async function onCancel() {
  if (!event.value) return
  acting.value = 'cancel'
  try {
    await cancelEvent(event.value.id)
    MessagePlugin.success('活动已取消')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 待发布 → 定时发布对话框 */
const scheduleVisible = ref(false)

function openSchedule() {
  scheduleVisible.value = true
}

/* 已取消 → 转为待发布（同步列表页操作） */
async function onRestore() {
  if (!event.value) return
  acting.value = 'restore'
  try {
    await restoreCancelledEvent(event.value.id)
    MessagePlugin.success('活动已转为待发布')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 已结束 / 已取消 → 归档（同步列表页操作） */
async function onArchive() {
  if (!event.value) return
  acting.value = 'archive'
  try {
    await archiveEvent(event.value.id)
    MessagePlugin.success('活动已归档')
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

const enrollmentColumns = [
  { colKey: 'name', title: '报名人', width: 100 , ellipsis: true},
  { colKey: 'enterprise', title: '所属企业', width: 150, ellipsis: true },
  { colKey: 'phone', title: '联系电话', width: 130 , ellipsis: true},
  { colKey: 'appliedAt', title: '报名时间', width: 150 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 96 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 120 },
]

const checkInColumns = [
  { colKey: 'name', title: '报名人', width: 120 , ellipsis: true},
  { colKey: 'enterprise', title: '所属企业', width: 180, ellipsis: true },
  { colKey: 'checkedIn', title: '签到状态', cell: 'checkState', width: 140 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 120 },
]

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    event.value = await fetchEvent(route.params.id as string)
  } catch {
    MessagePlugin.error('活动加载失败')
  } finally {
    loading.value = false
  }
}

const approvedList = computed(() => event.value?.enrollments.filter((e) => e.status === 'approved') ?? [])
const approvedCount = computed(() => approvedList.value.length)
const checkedCount = computed(() => event.value?.enrollments.filter((e) => e.checkedIn).length ?? 0)

function isReviewing(row: EventEnrollment, status: 'approved' | 'rejected') {
  return reviewing.value === `${row.userId}:${status}`
}

async function onReview(row: EventEnrollment, status: 'approved' | 'rejected') {
  if (!event.value) return
  reviewing.value = `${row.userId}:${status}`
  try {
    await reviewEventEnrollment(event.value.id, row.userId, status)
    MessagePlugin.success(status === 'approved' ? '已通过该报名' : '已驳回该报名')
    await load(true)
  } catch {
    MessagePlugin.error('操作失败，请重试')
  } finally {
    reviewing.value = ''
  }
}

async function onCheckIn(row: EventEnrollment) {
  if (!event.value) return
  checkingIn.value = row.userId
  try {
    await checkInEvent(event.value.id, row.userId)
    MessagePlugin.success('签到成功')
    await load(true)
  } catch {
    MessagePlugin.error('签到失败，请重试')
  } finally {
    checkingIn.value = ''
  }
}

/* checkInAt 形如 'YYYY-MM-DD HH:mm'，签到标签只展示 HH:mm */
function checkInTime(row: EventEnrollment) {
  if (!row.checkInAt) return ''
  return row.checkInAt.split(' ')[1] ?? row.checkInAt
}

onMounted(() => load())
</script>

<template>
  <div class="event-detail page-fade-in">
    <div class="back-row">
      <t-button variant="text" @click="router.back()">
        <template #icon><ArrowLeftIcon /></template>
        返回
      </t-button>
    </div>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '220px' }, { width: '100%', height: '380px' }]"
      animation="gradient"
    />

    <template v-else-if="event">
      <div class="page-card head-card">
        <div class="head-main">
          <div class="head-info">
            <div class="head-title-row">
              <h3 class="head-title">{{ event.title }}</h3>
              <t-tag variant="light">{{ event.type }}</t-tag>
              <StatusTag
                entity="event"
                :value="event.status"
                :scheduled-at="event.scheduledAt"
                :enrollment-open="event.enrollmentOpen"
              />
              <t-tag v-if="isArchived" theme="default" variant="light">已归档</t-tag>
            </div>
            <!-- 可见范围与可报名范围同行展示 -->
            <div class="scope-row">
              <div class="visibility-row">
                <span class="vis-label">可见范围</span>
                <template v-if="event.visibilityIdentities.length">
                  <t-tag v-for="t in event.visibilityIdentities" :key="t" variant="light" size="small">
                    {{ identityTypeMap[t] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">身份不限</t-tag>
                <template v-if="event.visibilityLevels.length">
                  <t-tag v-for="l in event.visibilityLevels" :key="l" variant="light" size="small">
                    {{ userLevelMap[l] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">等级不限</t-tag>
              </div>
              <span class="scope-divider"></span>
              <div class="visibility-row">
                <span class="vis-label">可报名范围</span>
                <template v-if="event.enrollmentIdentities.length">
                  <t-tag v-for="t in event.enrollmentIdentities" :key="t" variant="light" size="small">
                    {{ identityTypeMap[t] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">身份不限</t-tag>
                <template v-if="event.enrollmentLevels.length">
                  <t-tag v-for="l in event.enrollmentLevels" :key="l" variant="light" size="small">
                    {{ userLevelMap[l] }}
                  </t-tag>
                </template>
                <t-tag v-else variant="outline" size="small">等级不限</t-tag>
              </div>
            </div>
          </div>
          <div class="head-actions">
            <template v-if="!isArchived">
              <template v-if="event.status === 'pending_release'">
                <t-button variant="outline" @click="editVisible = true">编辑</t-button>
                <t-button theme="primary" :loading="acting === 'publish-now'" @click="onPublishNow">立即发布</t-button>
                <t-button variant="outline" @click="openSchedule">定时发布</t-button>
                <t-popconfirm content="确认取消该活动？取消后不可恢复" @confirm="onCancel">
                  <t-button variant="outline" theme="danger" :loading="acting === 'cancel'">取消活动</t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="event.status === 'cancelled'">
                <t-popconfirm content="确认将该活动转为「待发布」？" @confirm="onRestore">
                  <t-button variant="outline" theme="primary" :loading="acting === 'restore'">转为待发布</t-button>
                </t-popconfirm>
                <t-popconfirm content="确认归档该活动？归档后可在归档管理中恢复" @confirm="onArchive">
                  <t-button variant="outline" theme="warning" :loading="acting === 'archive'">归档</t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="event.status === 'scheduled'">
                <t-popconfirm content="确认取消定时发布？该活动将转为「待发布」" @confirm="onCancelSchedule">
                  <t-button variant="outline" theme="warning" :loading="acting === 'cancel-schedule'">
                    取消定时发布
                  </t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="event.status === 'published'">
                <t-button variant="outline" @click="editVisible = true">编辑</t-button>
                <t-button variant="outline" :loading="acting === 'enrollment'" @click="onToggleEnrollment">
                  {{ event.enrollmentOpen ? '暂停报名' : '开放报名' }}
                </t-button>
                <t-popconfirm content="确认取消该活动？取消后不可恢复" @confirm="onCancel">
                  <t-button
                    variant="outline"
                    theme="danger"
                    :loading="acting === 'cancel'"
                  >
                    取消活动
                  </t-button>
                </t-popconfirm>
              </template>
              <t-popconfirm
                v-else-if="event.status === 'ended'"
                content="确认归档该活动？归档后可在归档管理中恢复"
                @confirm="onArchive"
              >
                <t-button variant="outline" theme="warning" :loading="acting === 'archive'">归档</t-button>
              </t-popconfirm>
            </template>
          </div>
        </div>

        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="时间" :span="2">
            {{ event.startTime }} ~ {{ event.endTime }}
          </t-descriptions-item>
          <t-descriptions-item label="地点">{{ event.location }}</t-descriptions-item>
          <t-descriptions-item label="主讲嘉宾">{{ event.speaker }}</t-descriptions-item>
          <t-descriptions-item label="主办方">{{ event.host }}</t-descriptions-item>
          <t-descriptions-item label="容量">{{ event.capacity }} 人</t-descriptions-item>
          <t-descriptions-item label="报名数">{{ approvedCount }} 人</t-descriptions-item>
          <t-descriptions-item label="签到数">{{ checkedCount }} 人</t-descriptions-item>
          <t-descriptions-item label="报名审核">
            <t-tag variant="light" :theme="event.requireReview ? 'warning' : 'success'">
              {{ event.requireReview ? '需审核' : '无需审核（报名即通过）' }}
            </t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="报名截止时间">
            {{ event.enrollmentDeadline || '不限（活动开始前均可报名）' }}
          </t-descriptions-item>
          <t-descriptions-item v-if="event.status === 'scheduled' && event.scheduledAt" label="定时发布时间">
            {{ event.scheduledAt }}（到点自动发布）
          </t-descriptions-item>
        </t-descriptions>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <t-tab-panel value="info" label="活动信息">
            <div class="tab-body">
              <div class="desc rich-text" v-html="event.description"></div>
              <div class="tag-wrap">
                <t-tag v-for="tag in event.tags" :key="tag" variant="outline" size="small">
                  {{ tag }}
                </t-tag>
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel value="enrollments" label="报名管理">
            <div class="tab-body">
              <t-table
                v-if="event.enrollments.length"
                row-key="userId"
                :data="event.enrollments"
                :columns="enrollmentColumns"
              >
                <template #name="{ row }">
                  {{ row.name }}<t-tag class="id-tag" size="small" variant="light">{{ row.userId }}</t-tag>
                </template>
                <template #status="{ row }">
                  <StatusTag entity="enrollment" :value="row.status" />
                </template>
                <template #op="{ row }">
                  <template v-if="!isArchived && row.status === 'pending'">
                    <t-popconfirm content="确认通过该报名？" @confirm="onReview(row, 'approved')">
                      <t-button variant="text" :loading="isReviewing(row, 'approved')">通过</t-button>
                    </t-popconfirm>
                    <t-popconfirm content="确认驳回该报名？" @confirm="onReview(row, 'rejected')">
                      <t-button variant="text" :loading="isReviewing(row, 'rejected')">驳回</t-button>
                    </t-popconfirm>
                  </template>
                  <span v-else class="op-none">—</span>
                </template>
              </t-table>
              <t-empty v-else description="暂无报名" />
            </div>
          </t-tab-panel>

          <t-tab-panel value="checkin" label="签到管理">
            <div class="tab-body">
              <div class="checkin-summary">
                已签到 <span class="num">{{ checkedCount }}</span> / 已通过报名
                <span class="num">{{ approvedCount }}</span>
              </div>
              <t-table
                v-if="approvedList.length"
                row-key="userId"
                :data="approvedList"
                :columns="checkInColumns"
              >
                <template #name="{ row }">
                  {{ row.name }}<t-tag class="id-tag" size="small" variant="light">{{ row.userId }}</t-tag>
                </template>
                <template #checkState="{ row }">
                  <t-tag v-if="row.checkedIn" theme="success" variant="light">
                    已签到 {{ checkInTime(row) }}
                  </t-tag>
                  <t-tag v-else theme="warning" variant="light">未签到</t-tag>
                </template>
                <template #op="{ row }">
                  <t-button
                    v-if="!isArchived && !row.checkedIn"
                    variant="text"
                    :loading="checkingIn === row.userId"
                    @click="onCheckIn(row)"
                  >
                    手动签到
                  </t-button>
                  <span v-else class="op-none">—</span>
                </template>
              </t-table>
              <t-empty v-else description="暂无已通过报名" />
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <t-empty v-else description="活动不存在或已被删除" />

    <!-- 编辑活动弹窗 -->
    <EventFormDialog
      v-model:visible="editVisible"
      mode="edit"
      :event="event"
      @success="() => load(true)"
    />

    <!-- 待发布：定时发布对话框 -->
    <EventScheduleDialog v-model:visible="scheduleVisible" :event="event" @success="() => load(true)" />
  </div>
</template>

<style scoped>
.back-row {
  margin-bottom: 12px;
  margin-left: -8px;
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

.head-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.head-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.visibility-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

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

.tab-body {
  padding-top: 16px;
}

.desc {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--td-text-color-primary);
}

.tag-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.checkin-summary {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.num {
  font-weight: 600;
  color: var(--td-brand-color);
}

.op-none {
  color: var(--td-text-color-secondary);
}
</style>
