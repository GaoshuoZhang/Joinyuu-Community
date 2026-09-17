<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, DialogPlugin, Icon, Progress, Rate, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { cancelEnrollment, enrollEvent, fetchEvent, fetchMyEventFeedback, submitEventFeedback } from '@/api/events'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommunityEvent } from '@/types'
import { mockClockVersion, mockNowMs, parseMockStamp } from '@/mock/runtime'
import { downloadEventIcs } from '@/utils/ics'
import { shareContent } from '@/utils/share'

/* 移动活动详情：单列信息 + 操作区按报名态/身份/容量/截止分流；取消报名直接按钮 + Toast */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const eventId = route.params.id as string

const { data: event, loading, error, run } = useAsyncList<CommunityEvent>(() => fetchEvent(eventId))
onMounted(async () => {
  await run()
  await loadFavorite()
  await loadFeedback()
})

/* v38：活动反馈（结束后 + 参与过） */
const feedbackRating = ref(5)
const feedbackComment = ref('')
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

async function onSubmitFeedback() {
  if (feedbackSubmitting.value) return
  feedbackSubmitting.value = true
  try {
    await submitEventFeedback(eventId, { rating: feedbackRating.value, comment: feedbackComment.value.trim() || undefined })
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
  try {
    const ev = event.value
    favorited.value = await toggleFavorite('event', eventId, ev?.title ?? '', ev?.startTime)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

const acting = ref(false)

const isEnded = computed(() => event.value?.status === 'ended')
const isCancelled = computed(() => event.value?.status === 'cancelled')
const myStatus = computed(() => event.value?.myEnrollmentStatus)
const myCheckedIn = computed(() => event.value?.myCheckedIn ?? false)
const progressPct = computed(() => {
  const ev = event.value
  if (!ev || ev.capacity <= 0) return 0
  return Math.min(100, Math.round((ev.approvedCount / ev.capacity) * 100))
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
  void mockClockVersion.value
  const ev = event.value
  if (!ev) return ''
  if (!canEnrollSelf.value) return '当前身份不在该活动的可报名范围内'
  if (parseMockStamp(ev.enrollmentDeadline).getTime() < mockNowMs()) return '报名已截止'
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
    Toast(res.status === 'approved' ? '报名成功' : res.status === 'waitlisted' ? '已加入候补，有空位将自动递补' : '已提交，待审核')
    await run()
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
  return parseMockStamp(ev.startTime).getTime() - mockNowMs() < 24 * 60 * 60 * 1000
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
  await shareContent({ title: ev.title, text: `${ev.startTime} · ${ev.location}` })
}
</script>

<template>
  <div class="m-detail page-fade-in stagger">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="event">
      <p v-if="isCancelled" class="cancelled-banner">该活动已被取消，报名已同步取消</p>
      <p v-else-if="isEnded" class="ended-banner">该活动已结束</p>

      <section class="m-card">
        <div class="head">
          <Tag class="type-tag" size="small" variant="light" theme="primary">{{ event.typeLabel }}</Tag>
          <StateTag v-if="myStatus === 'pending'" kind="enroll" value="pending" />
          <StateTag v-else-if="myStatus === 'approved'" kind="enroll" value="approved" />
          <StateTag v-else-if="myStatus === 'waitlisted'" kind="enroll" value="waitlisted" />
          <StateTag v-else-if="myStatus === 'rejected'" kind="enroll" value="rejected" />
        </div>
        <h1 class="title">{{ event.title }}</h1>
        <p class="meta"><Icon name="time" size="14px" />{{ event.startTime }} ~ {{ event.endTime }}</p>
        <p class="meta"><Icon name="location" size="14px" />{{ event.location }}</p>
        <p class="meta"><Icon name="alarm" size="14px" />报名截止：{{ event.enrollmentDeadline }}<span v-if="event.requireReview"> · 报名需审核</span></p>
        <div class="progress-block">
          <div class="progress-head">
            <span>报名进度</span>
            <span class="progress-num">{{ event.approvedCount }}/{{ event.capacity }}</span>
          </div>
          <Progress :percentage="progressPct" :label="false" />
        </div>
        <div class="fav-row">
          <Button size="small" variant="outline" @click="onToggleFavorite">
            <Icon :name="favorited ? 'star-filled' : 'star'" size="16px" />{{ favorited ? '已收藏' : '收藏' }}
          </Button>
          <Button size="small" variant="outline" @click="onAddToCalendar">添加到日历</Button>
          <Button size="small" variant="outline" @click="onShare">分享</Button>
        </div>
      </section>

      <section class="m-card">
        <h3 class="sec-title">活动介绍</h3>
        <p class="desc">{{ event.description }}</p>
      </section>

      <section class="m-card actions">
        <template v-if="isCancelled">
          <p class="hint">活动已取消，无需到场；如有疑问请联系社区运营。</p>
        </template>

        <template v-else-if="isEnded">
          <p class="hint">活动已结束，感谢关注。</p>
          <template v-if="auth.isLogged && myStatus === 'approved'">
            <template v-if="feedbackSubmitted">
              <p class="status-line ok"><Icon name="check-circle" size="16px" />已提交反馈，感谢你的评价</p>
            </template>
            <template v-else>
              <p class="fb-label">活动反馈</p>
              <Rate v-model="feedbackRating" :count="5" aria-label="活动评分" />
              <Textarea v-model="feedbackComment" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="200" placeholder="活动体验如何？欢迎留下建议（选填）…" />
              <Button theme="primary" block :loading="feedbackSubmitting" @click="onSubmitFeedback">提交反馈</Button>
            </template>
          </template>
        </template>

        <template v-else-if="myStatus === 'pending'">
          <p class="status-line"><StateTag kind="enroll" value="pending" /><span>报名审核中，请耐心等待</span></p>
          <Button v-if="!cancelBlocked" theme="default" variant="outline" block :disabled="acting" @click="onCancelEnrollment">取消报名</Button>
          <p v-else class="hint">距活动开始不足 24 小时，如需取消请联系社区运营</p>
        </template>

        <template v-else-if="myStatus === 'approved'">
          <p v-if="myCheckedIn" class="status-line ok"><Icon name="check-circle" size="16px" />已签到</p>
          <p v-else class="status-line"><span>报名已通过，记得准时参加</span></p>
          <Button v-if="!myCheckedIn" theme="primary" block :disabled="acting" @click="goCheckIn">签到</Button>
          <Button v-if="!cancelBlocked" theme="default" variant="outline" block :disabled="acting" @click="onCancelEnrollment">取消报名</Button>
          <p v-else class="hint">距活动开始不足 24 小时，如需取消请联系社区运营</p>
        </template>

        <template v-else-if="myStatus === 'waitlisted'">
          <p class="status-line"><StateTag kind="enroll" value="waitlisted" /><span>你已加入候补，有空位将自动递补并通知你</span></p>
          <Button theme="default" variant="outline" block :disabled="acting" @click="onCancelEnrollment">退出候补</Button>
        </template>

        <template v-else-if="myStatus === 'rejected'">
          <p class="status-line"><StateTag kind="enroll" value="rejected" /><span>本次报名未通过</span></p>
          <p v-if="event.myEnrollmentRejectReason" class="disable-reason">原因：{{ event.myEnrollmentRejectReason }}</p>
          <Button v-if="!disableReason" theme="primary" block :disabled="acting" @click="onEnroll">重新报名</Button>
          <p v-else class="disable-reason">{{ disableReason }}</p>
        </template>

        <template v-else>
          <Button v-if="!auth.isLogged" theme="primary" block @click="onEnroll">登录后报名</Button>
          <Button v-else theme="primary" block :disabled="acting || !!disableReason" @click="onEnroll">
            {{ acting ? '报名中…' : event.approvedCount >= event.capacity ? '加入候补' : '立即报名' }}
          </Button>
          <p v-if="auth.isLogged && disableReason" class="disable-reason">{{ disableReason }}</p>
          <p v-else-if="event.approvedCount >= event.capacity" class="hint">名额已满，加入候补后如有空位将自动递补。</p>
          <p v-else-if="event.requireReview" class="hint">该活动报名需审核，提交后待管理员通过。</p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ended-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-page);
  border: 1px solid var(--td-component-border);
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.cancelled-banner {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--td-radius-large);
  background: var(--td-error-color-1, #fdecee);
  border: 1px solid var(--td-error-color);
  color: var(--td-error-color);
  font-size: 12px;
}

.fav-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.fb-label {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.type-tag {
  flex-shrink: 0;
}

.title {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 1.4;
}

.meta {
  margin: 5px 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.progress-block {
  margin-top: 14px;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-bottom: 6px;
}

.progress-num {
  color: var(--td-brand-color);
  font-weight: 600;
}

.sec-title {
  margin: 0 0 8px;
  font-size: 14px;
}

.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.status-line.ok {
  color: var(--td-success-color);
}

.hint {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  line-height: 1.6;
}

.disable-reason {
  margin: 0;
  font-size: 12px;
  color: var(--td-error-color);
  line-height: 1.6;
}
</style>
