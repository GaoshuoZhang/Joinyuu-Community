<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Image, Tag, Toast } from 'tdesign-mobile-vue'
import { cancelEnrollment, enrollEvent, fetchEvent, fetchMyEventFeedback, submitEventFeedback } from '@/api/events'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { onImageError } from '@/utils/imageFallback'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import EventEnrollmentActions from '@/components/events/EventEnrollmentActions.vue'
import EventFeedbackForm from '@/components/events/EventFeedbackForm.vue'
import FlowResult from '@/components/FlowResult.vue'
import type { CommunityEvent, EventEnrollmentResult } from '@/types'
import { downloadEventIcs } from '@/utils/ics'
import { shareContent } from '@/utils/share'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDateTime, formatZhNumber, parseLocalDateTime } from '@/utils/format'

/* 移动活动详情：单列信息 + 操作区按报名态/身份/容量/截止分流；取消报名直接按钮 + Toast */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const eventId = route.params.id as string
const businessNowMs = useBusinessNow()

const { data: event, loading, error, run } = useAsyncList<CommunityEvent>(() => fetchEvent(eventId))
onMounted(async () => {
  await run()
  await loadFavorite()
  await loadFeedback()
})

/* v38：活动反馈（结束后 + 参与过） */
const feedbackSubmitted = ref(false)
const feedbackSubmitting = ref(false)

async function loadFeedback() {
  if (!auth.isLogged || event.value?.status !== 'ended') return
  try {
    const mine = await fetchMyEventFeedback(eventId)
    feedbackSubmitted.value = !!mine
  } catch {
    feedbackSubmitted.value = false
  }
}

async function onSubmitFeedback(payload: { rating: number; comment: string }) {
  if (feedbackSubmitting.value) return
  feedbackSubmitting.value = true
  try {
    await submitEventFeedback(eventId, { rating: payload.rating, comment: payload.comment || undefined })
    feedbackSubmitted.value = true
    Toast('感谢你的反馈')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '提交失败，请稍后重试')
  } finally {
    feedbackSubmitting.value = false
  }
}

/* v37 收藏 */
const favorited = ref(false)
async function loadFavorite() {
  try {
    const list = await listFavorites()
    favorited.value = list.some((item) => item.type === 'event' && item.targetId === eventId)
  } catch {
    favorited.value = false
  }
}

async function onToggleFavorite() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const next = !favorited.value
  favorited.value = next
  try {
    const ev = event.value
    favorited.value = await toggleFavorite('event', eventId, ev?.title ?? '', ev?.startTime)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    favorited.value = !next
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

const acting = ref(false)
const enrollmentResult = ref<EventEnrollmentResult | null>(null)

const isEnded = computed(() => event.value?.status === 'ended')
const isCancelled = computed(() => event.value?.status === 'cancelled')
const myStatus = computed(() => event.value?.myEnrollmentStatus)
const myCheckedIn = computed(() => event.value?.myCheckedIn ?? false)
/* 未结束/未取消时，报名操作区固定在底部，为内容区预留空间 */
const showEnrollmentBar = computed(() => !isEnded.value && !isCancelled.value)
const enrollmentResultTitle = computed(() =>
  enrollmentResult.value?.status === 'approved'
    ? '报名成功'
    : enrollmentResult.value?.status === 'waitlisted'
      ? '已加入候补'
      : '报名已提交',
)
const enrollmentResultDescription = computed(() => {
  const result = enrollmentResult.value
  if (result?.status === 'approved') return '报名已通过，可在我的报名中查看活动安排和签到入口。'
  if (result?.status === 'waitlisted') {
    return result.waitlistOrder
      ? `当前候补第 ${formatZhNumber(result.waitlistOrder)} 位，有空位时将自动递补并通知你。`
      : '有空位时将按顺序自动递补并通知你。'
  }
  return '报名已进入审核队列，审核结果将通过站内信通知。'
})

const canEnrollSelf = computed(() => {
  const ev = event.value
  if (!ev) return false
  if (ev.enrollmentIdentities.length === 0) return true
  return auth.identities.some((i) => {
    if (!ev.enrollmentIdentities.includes(i.type)) return false
    if (ev.enrollmentLevels.length === 0) return true
    return i.level !== undefined && ev.enrollmentLevels.includes(i.level)
  })
})

const disableReason = computed(() => {
  const ev = event.value
  if (!ev) return ''
  if (!canEnrollSelf.value) return '当前身份不在该活动的可报名范围内'
  const deadline = parseLocalDateTime(ev.enrollmentDeadline)
  if (deadline && deadline.getTime() < businessNowMs.value) return '报名已截止'
  /* v38：满员不再禁止报名（改为加入候补） */
  return ''
})

async function onEnroll() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  acting.value = true
  try {
    const res = await enrollEvent(eventId)
    enrollmentResult.value = res
  } catch (e) {
    Toast(e instanceof Error ? e.message : '报名失败，请稍后重试')
  } finally {
    acting.value = false
  }
}

function onCancelEnrollment() {
  DialogPlugin.confirm({
    title: '取消报名',
    content: '确认取消本次报名？名额将释放给其他成员。',
    cancelBtn: '再想想',
    confirmBtn: '确认取消',
    onConfirm: () => {
      void onCancel()
    },
  })
}

async function onCancel() {
  acting.value = true
  try {
    await cancelEnrollment(eventId)
    Toast('已取消报名')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
  } finally {
    acting.value = false
  }
}

function goCheckIn() {
  router.push(`/events/${eventId}/check-in`)
}

/* v38：取消防止时间（活动开始前 24 小时） */
const cancelBlocked = computed(() => {
  const ev = event.value
  if (!ev) return false
  if (myStatus.value === 'waitlisted') return false
  const start = parseLocalDateTime(ev.startTime)
  return start ? start.getTime() - businessNowMs.value < 24 * 60 * 60 * 1000 : false
})

/* v39：添加到日历（.ics 下载） */function onAddToCalendar() {
  const ev = event.value
  if (!ev) return
  downloadEventIcs({
    id: ev.id,
    title: ev.title,
    startTime: ev.startTime,
    endTime: ev.endTime,
    location: ev.location,
    description: ev.description,
  })
  Toast('日历文件已生成，可导入系统日历')
}

/* v40：分享活动 */
async function onShare() {
  const ev = event.value
  if (!ev) return
  await shareContent({ title: ev.title, text: `${formatLocalDateTime(ev.startTime)} · ${ev.location}` })
}
</script>

<template>
  <div class="m-detail page-fade-in stagger" :class="{ 'has-floating-enroll': showEnrollmentBar }">
    <FlowResult
      v-if="enrollmentResult"
      :title="enrollmentResultTitle"
      :description="enrollmentResultDescription"
      :reference="eventId"
      primary-text="查看我的报名"
      secondary-text="返回活动列表"
      @primary="router.replace('/me/enrollments')"
       @secondary="router.replace('/plaza?tab=events')"
    />
    <ListSkeleton v-else-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="event">
      <p v-if="isCancelled" class="cancelled-banner">该活动已被取消，报名已同步取消</p>
      <p v-else-if="isEnded" class="ended-banner">该活动已结束</p>

      <section class="m-card">
        <Image v-if="event.coverUrl" class="detail-cover" :src="event.coverUrl" :alt="event.title" fit="cover" @error="onImageError" />
        <div class="head">
          <Tag class="type-tag" size="small" variant="light" theme="primary">{{ event.typeLabel }}</Tag>
          <StateTag v-if="myStatus === 'pending'" kind="enroll" value="pending" />
          <StateTag v-else-if="myStatus === 'approved'" kind="enroll" value="approved" />
          <StateTag v-else-if="myStatus === 'waitlisted'" kind="enroll" value="waitlisted" />
          <StateTag v-else-if="myStatus === 'rejected'" kind="enroll" value="rejected" />
        </div>
        <h2 class="title">{{ event.title }}</h2>
        <p class="meta"><Icon aria-hidden="true" name="time" size="14px" />{{ formatLocalDateTime(event.startTime) }} ~ {{ formatLocalDateTime(event.endTime) }}</p>
        <p class="meta"><Icon aria-hidden="true" name="location" size="14px" />{{ event.location }}</p>
        <p class="meta"><Icon aria-hidden="true" name="alarm" size="14px" />报名截止：{{ formatLocalDateTime(event.enrollmentDeadline) }}<span v-if="event.requireReview"> · 报名需审核</span></p>
        <p class="meta"><Icon aria-hidden="true" name="usergroup" size="14px" />人数限制 {{ formatZhNumber(event.capacity) }} 人</p>
        <div class="fav-row">
          <Button size="small" variant="outline" @click="onToggleFavorite">
            <template #icon><Icon aria-hidden="true" :name="favorited ? 'star-filled' : 'star'" size="16px" /></template>
            {{ favorited ? '已收藏' : '收藏' }}
          </Button>
          <Button size="small" variant="outline" @click="onAddToCalendar">
            <template #icon><Icon aria-hidden="true" name="calendar" size="16px" /></template>
            添加到日历
          </Button>
          <Button size="small" variant="outline" @click="onShare">
            <template #icon><Icon aria-hidden="true" name="share" size="16px" /></template>
            分享
          </Button>
        </div>
      </section>

      <section class="m-card">
        <h3 class="sec-title">活动介绍</h3>
        <RichTextBlock class="desc" :html="event.description" />
      </section>

      <section v-if="isCancelled" class="m-card actions">
        <p class="hint">活动已取消，无需到场；如有疑问请联系社区运营。</p>
      </section>
      <section v-else-if="isEnded" class="m-card actions">
        <p class="hint">活动已结束，感谢关注。</p>
        <EventFeedbackForm
          v-if="auth.isLogged && myStatus === 'approved'"
          :submitted="feedbackSubmitted"
          :submitting="feedbackSubmitting"
          @feedback="onSubmitFeedback"
        />
      </section>
      <EventEnrollmentActions
        v-else
        :event="event"
        :my-status="myStatus"
        :my-checked-in="myCheckedIn"
        :logged-in="auth.isLogged"
        :acting="acting"
        :cancel-blocked="cancelBlocked"
        :disable-reason="disableReason"
        :enroll-forbidden="!canEnrollSelf"
        @enroll="onEnroll"
        @cancel="onCancelEnrollment"
        @check-in="goCheckIn"
      />
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.m-detail.has-floating-enroll {
  padding-bottom: calc(170px + env(safe-area-inset-bottom));
}

.detail-cover {
  display: block;
  width: calc(100% + var(--app-space-8) * 2);
  height: 180px;
  margin: calc(var(--app-space-8) * -1) calc(var(--app-space-8) * -1) var(--app-space-6);
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
}

.ended-banner {
  margin:0;
  padding:var(--app-space-5) var(--app-space-7);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-page);
  border: 1px solid var(--td-component-border);
  color: var(--td-text-color-secondary);
  font-size: var(--app-font-caption);
}

.cancelled-banner {
  margin:0;
  padding:var(--app-space-5) var(--app-space-7);
  border-radius: var(--td-radius-large);
  background: var(--td-error-color-1, #fdecee);
  border: 1px solid var(--td-error-color);
  color: var(--td-error-color);
  font-size: var(--app-font-caption);
}

.fav-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--app-space-4);
  margin-top: var(--app-space-5);
}

.head {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
  margin-bottom:var(--app-space-5);
}

.type-tag {
  flex-shrink: 0;
}

.title {
  margin:0 0 var(--app-space-6);
  font-size: var(--app-font-title);
  line-height: 1.4;
}

.meta {
  margin:var(--app-space-3) 0;
  display: flex;
  align-items: center;
  gap:var(--app-space-2);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-body);
}

.desc {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

</style>
