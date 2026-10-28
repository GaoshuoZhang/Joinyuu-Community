<script setup lang="ts">
import CommerceBusinessLink from '@/components/CommerceBusinessLink.vue'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab, backOrFallback } from '@/utils/navigation'
import { MessagePlugin, type FormProps } from 'tdesign-vue-next'
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
  fetchEventTickets,
  publishEventNow,
  redeemEventTicket,
  rescheduleEvent,
  restoreCancelledEvent,
  reviewEventEnrollment,
  setEventEnrollment,
} from '@/api/events'
import { fetchSystemConfig } from '@/api/systemConfig'
import QRCode from 'qrcode'
import type { EventTicketRow } from '@/api/events'
import type { CommunityEvent, EventEnrollment } from '@/types'
import { exportCsv } from '@/utils/exportCsv'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { isNotFound } from '@/api/http'
import ListErrorState from '@/components/ListErrorState.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const refreshing = ref(false)
const ticketsLoading = ref(false)
const ticketsError = ref('')
const canAct = computed(() => !loading.value && !refreshing.value && !loadError.value)
const event = ref<CommunityEvent | null>(null)
const tab = useQueryTab('info', ['info', 'enrollments', 'checkin', 'tickets'] as const)
/* 已归档条目：隐藏全部写操作（含报名审核/签到），仅保留只读内容 */
const isArchived = computed(() => !!event.value?.deletedAt)
/* 当前审核中的记录标识：`${userId}:${approved | rejected}` */
const reviewing = ref('')
/* 当前手动签到中的用户标识 */
const checkingIn = ref('')
/* 编辑弹窗 */
const editVisible = ref(false)
const tickets = ref<EventTicketRow[]>([])
const redeemCode = ref('')
const redeeming = ref(false)

/* 操作中的标识 */
const acting = ref('')
const rescheduleVisible = ref(false)
const rescheduleForm = reactive({ startTime: '', endTime: '', reason: '' })
const rescheduleFormRef = ref()
/* 规则 trigger 一律 submit：确认时 validate 才红框提示（与项目弹窗惯例一致） */
const rescheduleRules: FormProps['rules'] = {
  startTime: [{ required: true, message: '请选择新开始时间', trigger: 'submit' }],
  endTime: [{ required: true, message: '请选择新结束时间', trigger: 'submit' }],
  reason: [{ required: true, message: '请填写改期原因', trigger: 'submit' }],
}

function openReschedule() {
  if (!event.value || !canAct.value) return
  rescheduleForm.startTime = event.value.startTime
  rescheduleForm.endTime = event.value.endTime
  rescheduleForm.reason = ''
  rescheduleVisible.value = true
  nextTick(() => rescheduleFormRef.value?.clearValidate())
}

async function onReschedule() {
  if (!event.value || !canAct.value) return
  const valid = await rescheduleFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(rescheduleFormRef.value)
  acting.value = 'reschedule'
  try {
    const result = await rescheduleEvent(event.value.id, { ...rescheduleForm, reason: rescheduleForm.reason.trim() })
    MessagePlugin.success(`活动已改期，已通知 ${result.notified} 位报名者`)
    rescheduleVisible.value = false
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '改期失败')
  } finally {
    acting.value = ''
  }
}

/* 待发布 → 立即发布（开放报名） */
async function onPublishNow() {
  if (!event.value || !canAct.value) return
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
  if (!event.value || !canAct.value) return
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
  if (!event.value || !canAct.value) return
  acting.value = 'enrollment'
  const wasOpen = event.value.enrollmentOpen
  try {
    await setEventEnrollment(event.value.id, !wasOpen)
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
  if (!event.value || !canAct.value) return
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
  if (!event.value || !canAct.value) return
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
  if (!event.value || !canAct.value) return
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
  { colKey: 'message', title: '留言', cell: 'message', width: 200, ellipsis: true },
  { colKey: 'appliedAt', title: '报名时间', width: 170 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 96 , ellipsis: true},
  { colKey: 'waitlistOrder', title: '候补顺序', cell: 'waitlistOrder', width: 96, ellipsis: true },
  { colKey: 'op', fixed: 'right' as const, title: '操作', cell: 'op', width: 120 },
]

const checkInColumns = [
  { colKey: 'name', title: '报名人', width: 120 , ellipsis: true},
  { colKey: 'enterprise', title: '所属企业', width: 180, ellipsis: true },
  { colKey: 'checkedIn', title: '签到状态', cell: 'checkState', width: 140 , ellipsis: true},
  { colKey: 'checkinMethod', title: '签到方式', cell: 'checkinMethod', width: 110, ellipsis: true },
  { colKey: 'checkinLocation', title: '签到坐标', cell: 'checkinLocation', width: 180, ellipsis: true },
  { colKey: 'op', fixed: 'right' as const, title: '操作', cell: 'op', width: 120 },
]

let ticketsVersion = 0
async function loadTickets() {
  const request = ++ticketsVersion
  ticketsLoading.value = true
  ticketsError.value = ''
  try {
    const result = await fetchEventTickets(route.params.id as string)
    if (request === ticketsVersion) tickets.value = result
  } catch (error) {
    if (request === ticketsVersion) {
      tickets.value = []
      ticketsError.value = error instanceof Error ? error.message : '票务数据加载失败'
    }
  } finally {
    if (request === ticketsVersion) ticketsLoading.value = false
  }
}

async function load(silent = false) {
  if (refreshing.value) return
  if (!silent) loading.value = true
  refreshing.value = true
  try {
    event.value = await fetchEvent(route.params.id as string)
    loadError.value = ''
    await loadTickets()
  } catch (e) {
    if (isNotFound(e)) {
      event.value = null
      loadError.value = ''
    } else {
      loadError.value = e instanceof Error ? e.message : '活动刷新失败，当前显示上次成功加载的数据'
    }
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const approvedList = computed(() => event.value?.enrollments.filter((e) => e.status === 'approved') ?? [])
const approvedCount = computed(() => approvedList.value.length)
const checkedCount = computed(() => event.value?.enrollments.filter((e) => e.checkedIn).length ?? 0)

function isReviewing(row: EventEnrollment, status: 'approved' | 'rejected') {
  return reviewing.value === `${row.userId}:${status}`
}

async function onReview(row: EventEnrollment, status: 'approved') {
  if (!event.value || !canAct.value) return
  reviewing.value = `${row.userId}:approved`
  try {
    await reviewEventEnrollment(event.value.id, row.userId, status)
    MessagePlugin.success('已通过该报名')
    await load(true)
  } catch {
    MessagePlugin.error('操作失败，请重试')
  } finally {
    reviewing.value = ''
  }
}

/* 驳回必填原因（与报名审核列表页一致）：弹窗填写后提交，原因随通知下发申请人并记入审计 */
const rejectVisible = ref(false)
const rejectRow = ref<EventEnrollment | null>(null)
const rejectFormRef = ref()
const rejectForm = reactive({ reason: '' })
const rejectSubmitting = ref(false)
const rejectRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写驳回原因', trigger: 'submit' }],
}

function openReject(row: EventEnrollment) {
  rejectRow.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
  nextTick(() => rejectFormRef.value?.clearValidate())
}

async function onConfirmReject() {
  const row = rejectRow.value
  if (!event.value || !canAct.value || !row) return
  const valid = await rejectFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(rejectFormRef.value)
  rejectSubmitting.value = true
  try {
    await reviewEventEnrollment(event.value.id, row.userId, 'rejected', rejectForm.reason)
    MessagePlugin.success('已驳回该报名')
    rejectVisible.value = false
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败，请重试')
  } finally {
    rejectSubmitting.value = false
  }
}

async function onCheckIn(row: EventEnrollment) {
  if (!event.value || !canAct.value) return
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

async function onRedeemTicket() {
  if (!canAct.value || ticketsLoading.value || ticketsError.value) return
  if (!event.value || !redeemCode.value.trim()) {
    MessagePlugin.warning('请输入核销码')
    return
  }
  redeeming.value = true
  try {
    await redeemEventTicket(event.value.id, redeemCode.value)
    MessagePlugin.success('电子票核销成功')
    redeemCode.value = ''
    await load(true)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '核销失败')
  } finally {
    redeeming.value = false
  }
}

function exportTickets() {
  exportCsv(
    `活动票务-${event.value?.id ?? ''}`,
    ['票号', '核销码', '报名人', '用户编号', '核销时间'],
    tickets.value.map((ticket) => [
      ticket.ticketNo,
      ticket.redeemCode,
      ticket.userName,
      ticket.userId,
      ticket.redeemedAt ?? '未核销',
    ]),
  )
}

/* checkInAt 形如 'YYYY-MM-DD HH:mm'，签到标签只展示 HH:mm */
function checkInTime(row: EventEnrollment) {
  if (!row.checkInAt) return ''
  return row.checkInAt.split(' ')[1] ?? row.checkInAt
}

/* 签到二维码：扫一扫直达客户端签到页（未登录会先要求登录）；
 * 签到码启用时 URL 带上 ?code= 自动预填，签到只需点「签到」或「获取定位并签到」 */
const qrGenerating = ref(false)
async function onDownloadCheckInQr() {
  if (!event.value || qrGenerating.value) return
  qrGenerating.value = true
  try {
    const config = await fetchSystemConfig()
    const base = config.mobileUrl.includes('://') ? config.mobileUrl : `http://${config.mobileUrl}`
    const codeEnabled = event.value.checkinCodeRequired && !!event.value.checkinCode
    const url = `${base}/events/${event.value.id}/check-in${codeEnabled ? `?code=${event.value.checkinCode}` : ''}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `活动${event.value.id}-签到二维码.png`
    link.click()
    MessagePlugin.success('签到二维码已生成并下载')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '二维码生成失败')
  } finally {
    qrGenerating.value = false
  }
}

onMounted(() => load())
const { close: closeRescheduleDialog } = useDialogFormProtection(rescheduleForm, rescheduleVisible, computed(() => !!acting.value))
const { close: closeRejectDialog } = useDialogFormProtection(rejectForm, rejectVisible, rejectSubmitting)
</script>

<template>
  <div class="event-detail page-fade-in">
    <CommerceBusinessLink module="event" />
    <t-button variant="text" theme="default" class="back-btn" @click="backOrFallback(router, '/events')">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '220px' }, { width: '100%', height: '380px' }]"
      animation="gradient"
    />

    <template v-else-if="event">
      <ListErrorState v-if="loadError" :message="loadError" :loading="refreshing" @retry="() => load(true)" />
      <t-alert v-else-if="refreshing" theme="info" title="正在刷新活动数据，完成后可继续操作" />
      <div class="page-card head-card">
        <div class="head-main">
          <div class="head-info">
            <div class="head-title-row">
              <h3 class="head-name">{{ event.title }}</h3>
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
            <t-button v-if="!isArchived" variant="outline" :loading="qrGenerating" @click="onDownloadCheckInQr">
              签到二维码
            </t-button>
            <template v-if="!isArchived && canAct">
              <template v-if="event.status === 'pending_release'">
                <t-button theme="primary" :loading="acting === 'publish-now'" @click="onPublishNow">立即发布</t-button>
                <t-button variant="outline" @click="editVisible = true">编辑</t-button>
                <t-button variant="outline" @click="openSchedule">定时发布</t-button>
                <t-popconfirm content="确认取消该活动？取消后可转为待发布，已报名成员将收到通知" @confirm="onCancel">
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
                <t-button variant="outline" theme="warning" @click="openReschedule">活动改期</t-button>
                <!-- 暂停报名影响全部成员报名需确认；开放报名为恢复性操作直接执行 -->
                <t-popconfirm
                  v-if="event.enrollmentOpen"
                  content="确认暂停报名？暂停后成员将无法报名"
                  confirm-btn="暂停报名"
                  @confirm="onToggleEnrollment"
                >
                  <t-button variant="outline" :loading="acting === 'enrollment'">暂停报名</t-button>
                </t-popconfirm>
                <t-button v-else variant="outline" :loading="acting === 'enrollment'" @click="onToggleEnrollment">
                  开放报名
                </t-button>
                <t-popconfirm content="确认取消该活动？取消后可转为待发布，已报名成员将收到通知" @confirm="onCancel">
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
          <t-descriptions-item label="创建时间">{{ event.createdAt ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="签到码">
            <template v-if="event.checkinCodeRequired && event.checkinCode">{{ event.checkinCode }}</template>
            <span v-else>未启用</span>
          </t-descriptions-item>
          <t-descriptions-item label="计划开始时间">{{ event.startTime }}</t-descriptions-item>
          <t-descriptions-item label="计划结束时间">{{ event.endTime }}</t-descriptions-item>
          <t-descriptions-item label="地点">{{ event.location }}</t-descriptions-item>
          <t-descriptions-item label="主讲嘉宾">{{ event.speaker }}</t-descriptions-item>
          <t-descriptions-item label="主办方">{{ event.host }}</t-descriptions-item>
          <t-descriptions-item label="容量">{{ event.capacity }} 人</t-descriptions-item>
          <t-descriptions-item label="报名数">{{ approvedCount }} 人</t-descriptions-item>
          <t-descriptions-item label="签到数">{{ checkedCount }} 人</t-descriptions-item>
          <t-descriptions-item label="报名审核">
            <StatusTag entity="reviewMode" :value="event.requireReview ? 'required' : 'optional'" />
            <span v-if="!event.requireReview" class="field-help">报名即通过</span>
          </t-descriptions-item>
          <t-descriptions-item label="报名截止时间">
            <t-tooltip v-if="!event.enrollmentDeadline" content="不限，活动开始前均可报名">
              <span>—</span>
            </t-tooltip>
            <template v-else>{{ event.enrollmentDeadline }}</template>
          </t-descriptions-item>
          <t-descriptions-item label="签到范围">
            {{ event.venueLat && event.venueLng ? `${event.venueLat}, ${event.venueLng}（${event.checkinRadiusM ?? 200} 米）` : '未启用地理围栏' }}
          </t-descriptions-item>
          <t-descriptions-item label="签到时间窗">
            开始前 {{ event.checkinOpenMin ?? 30 }} 分钟至开始后 {{ event.checkinCloseMin ?? 30 }} 分钟
          </t-descriptions-item>
          <t-descriptions-item label="取消报名时限">
            开场前 {{ event.cancelDeadlineHours ?? 24 }} 小时
          </t-descriptions-item>
          <t-descriptions-item v-if="event.rescheduledTo" label="最近改期至">
            {{ event.rescheduledTo }}
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
              <div class="feedback-block">
                <h4>活动反馈</h4>
                <p class="feedback-summary">
                  平均评分 {{ event.feedbackSummary?.average ?? 0 }} / 5，共 {{ event.feedbackSummary?.total ?? 0 }} 条
                </p>
                <t-list v-if="event.feedbackSummary?.list.length" :split="true">
                  <t-list-item v-for="item in event.feedbackSummary.list" :key="`${item.userId}-${item.at}`">
                    <t-list-item-meta :title="`${item.userId} · ${item.rating} 星`" :description="item.comment || '未填写文字反馈'" />
                    <template #action>{{ item.at }}</template>
                  </t-list-item>
                </t-list>
                <t-empty v-else description="暂无活动反馈，成员报名与签到后会展示在这里" />
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
                <!-- 留言（报名时选填）：单行截断 + hover 全文 -->
                <template #message="{ row }">
                  <t-tooltip v-if="row.message" :content="row.message" placement="top-left">
                    <span class="message-cell">{{ row.message }}</span>
                  </t-tooltip>
                  <span v-else class="muted-dash">—</span>
                </template>
                <template #status="{ row }">
                  <StatusTag entity="enrollment" :value="row.status" />
                </template>
                <template #waitlistOrder="{ row }">{{ row.waitlistOrder ?? '—' }}</template>
                <template #op="{ row }">
                  <template v-if="!isArchived && canAct && row.status === 'pending'">
                    <t-popconfirm content="确认通过该报名？" @confirm="onReview(row, 'approved')">
                      <t-button variant="text" :loading="isReviewing(row, 'approved')">通过</t-button>
                    </t-popconfirm>
                    <t-button variant="text" theme="danger" @click="openReject(row)">驳回</t-button>
                  </template>
                  <span v-else class="op-none">—</span>
                </template>
              </t-table>
              <t-empty v-else description="暂无报名，可放宽可报名范围或活动报名开放后成员自行报名" />
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
                  <StatusTag entity="checkin" :value="row.checkedIn ? 'checked' : 'unchecked'" />
                  <span v-if="row.checkedIn" class="field-help">{{ checkInTime(row) }}</span>
                </template>
                <template #checkinMethod="{ row }">
                  {{ row.checkinMethod === 'self' ? '自助签到' : row.checkinMethod === 'admin' ? '管理端补签' : '—' }}
                </template>
                <template #checkinLocation="{ row }">
                  {{ row.checkinLat && row.checkinLng ? `${row.checkinLat}, ${row.checkinLng}` : '—' }}
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
              <t-empty v-else description="暂无已通过的报名，先处理待审核报名" />
            </div>
          </t-tab-panel>

          <t-tab-panel value="tickets" label="票务核销">
            <div class="tab-body">
              <ListErrorState v-if="ticketsError" :message="ticketsError" :loading="ticketsLoading" @retry="loadTickets" />
              <div class="ticket-tools">
                <!-- 核销为一次性不可逆消费：确认统一走「核销」按钮的 popconfirm（输入框回车不再直接核销，防误触） -->
                <t-input v-accessible-field="'电子票核销码'" class="ctl-w-xl" v-model="redeemCode" placeholder="输入 8 位核销码…" clearable />
                <t-popconfirm
                  content="确认核销该电子票？核销后票不可再用"
                  confirm-btn="确认核销"
                  @confirm="onRedeemTicket"
                >
                  <t-button theme="primary" :loading="redeeming" :disabled="!canAct || ticketsLoading || !!ticketsError || isArchived">核销</t-button>
                </t-popconfirm>
                <t-button variant="outline" :disabled="ticketsLoading || !!ticketsError" @click="exportTickets">导出票务名单</t-button>
              </div>
              <t-table
                v-if="!ticketsError && tickets.length"
                row-key="ticketNo"
                :data="tickets"
                :columns="[
                  { colKey: 'ticketNo', title: '票号', width: 160, ellipsis: true },
                  { colKey: 'redeemCode', title: '核销码', width: 160, ellipsis: true },
                  { colKey: 'userName', title: '报名人', width: 160, ellipsis: true },
                  { colKey: 'userId', title: '用户编号', width: 160, ellipsis: true },
                  { colKey: 'redeemedAt', title: '核销状态', cell: 'redeemedAt', width: 160, ellipsis: true },
                ]"
              >
                <template #redeemedAt="{ row }">
                  <StatusTag entity="redeem" :value="row.redeemedAt ? 'redeemed' : 'unredeemed'" />
                  <span v-if="row.redeemedAt" class="field-help">{{ row.redeemedAt }}</span>
                </template>
              </t-table>
              <t-empty v-else description="暂无已签发电子票，报名通过后将自动签发电子票" />
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <ListErrorState v-else-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />

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

    <!-- 改期弹窗含表单输入：禁用点遮罩关闭，防误触丢失输入 -->
    <t-dialog
      :visible="rescheduleVisible" @close="closeRescheduleDialog"
      :header="event ? `活动改期 · ${event.title}` : '活动改期'"
      width="560px"
      :close-on-overlay-click="false"
    >
      <t-form ref="rescheduleFormRef" :data="rescheduleForm" :rules="rescheduleRules" label-align="top">
        <div class="reschedule-grid">
          <t-form-item label="新开始时间" name="startTime">
            <t-date-picker v-accessible-field v-model="rescheduleForm.startTime" valueType="YYYY-MM-DD HH:mm" enable-time-picker class="ctl-w-full" />
          </t-form-item>
          <t-form-item label="新结束时间" name="endTime">
            <t-date-picker v-accessible-field v-model="rescheduleForm.endTime" valueType="YYYY-MM-DD HH:mm" enable-time-picker class="ctl-w-full" />
          </t-form-item>
        </div>
        <t-form-item label="改期原因" name="reason">
          <t-textarea v-accessible-field v-model="rescheduleForm.reason" :maxlength="200" placeholder="将随站内信通知报名者…" />
        </t-form-item>
      </t-form>
      <template #footer>
        <t-button variant="text" theme="default" @click="closeRescheduleDialog">取消</t-button>
        <t-button theme="primary" :loading="acting === 'reschedule'" @click="onReschedule">确认改期并通知</t-button>
      </template>
    </t-dialog>

    <!-- 驳回原因对话框：必填，原因随站内通知下发申请人并记入审计 -->
    <t-dialog
      :visible="rejectVisible" @close="closeRejectDialog"
      header="驳回报名"
      width="480px"
      :close-on-overlay-click="!rejectSubmitting"
    >
      <p class="reject-tip">
        {{ rejectRow ? `驳回 ${rejectRow.name} 的报名` : '' }}原因将通过站内通知告知申请人。
      </p>
      <t-form ref="rejectFormRef" :data="rejectForm" :rules="rejectRules">
        <t-form-item label="驳回原因" name="reason">
          <t-textarea
            v-accessible-field
            v-model="rejectForm.reason"
            :maxlength="200"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请填写驳回原因（必填，将通知申请人）…"
          />
        </t-form-item>
      </t-form>
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeRejectDialog">取消</t-button>
          <t-button theme="danger" :loading="rejectSubmitting" @click="onConfirmReject">确认驳回</t-button>
        </div>
      </template>
    </t-dialog>
  </div>
</template>

<style scoped>
.reject-tip {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

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
  /* 窄屏：操作区整行落到左侧信息块下方，不把标题挤成逐字竖排（同 .page-header） */
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.head-info {
  flex: 1 1 auto;
  min-width: 240px;
}

.head-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
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
  /* 换行后仍贴右（同 .page-header-actions） */
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
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

.feedback-block {
  margin-top: 24px;
}

.feedback-block h4 {
  margin: 0 0 8px;
}

.feedback-summary {
  color: var(--td-text-color-secondary);
}

.checkin-summary {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ticket-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.num {
  font-weight: 600;
  color: var(--td-brand-color);
}

.op-none {
  color: var(--td-text-color-secondary);
}

.reschedule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* 窄屏：头部信息与操作区纵向堆叠、操作按钮换行，避免按钮被挤压溢出 */
@media (max-width: 767px) {
  .head-main {
    flex-direction: column;
    align-items: stretch;
  }

  .head-actions {
    flex-wrap: wrap;
  }
}

/* 报名留言单元格：单行截断（列已 ellipsis，此处保证 tooltip 触发的截断样式一致） */
.message-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}
</style>
