<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, Image, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { cancelEnrollment, enrollEvent, fetchEvent, fetchMyEventFeedback, submitEventFeedback } from '@/api/events'
import { fetchMe } from '@/api/me'
import CategoryTag from '@/components/shared/CategoryTag.vue'
import { canCancelEnrollment } from '@/utils/enrollment'
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
  /* 公开路由：游客不请求收藏列表，避免 401 被统一拦截跳登录 */
  if (!auth.isLogged) return
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

const isEnded = computed(() => {
  const ev = event.value
  if (!ev) return false
  const end = parseLocalDateTime(ev.endTime)
  return ev.status === 'ended' || (end !== null && end.getTime() <= businessNowMs.value)
})
const isCancelled = computed(() => event.value?.status === 'cancelled')
const enrollmentDeadlineLabel = computed(() => {
  const value = event.value?.enrollmentDeadline
  return value && parseLocalDateTime(value) ? formatLocalDateTime(value) : '未设固定截止时间'
})
/* 活动介绍：富文本 HTML 分支不能开 pre-wrap（源码缩进/换行会被原样渲染成可见空白），
 * 仅纯文本分支需要 pre-wrap 保留换行（判定口径与 RichTextBlock 的富文本识别一致）。 */
const descIsPlainText = computed(() => !/<\/?[a-z][^>]*>/i.test(event.value?.description ?? ''))
const myStatus = computed(() => event.value?.myEnrollmentStatus)
const myCheckedIn = computed(() => event.value?.myCheckedIn ?? false)
/* 主讲嘉宾/标签：后台可留空（嘉宾留空时保存为「—」占位，不展示该行） */
const speakerLabel = computed(() => {
  const value = (event.value?.speaker ?? '').trim()
  return value && value !== '—' ? value : ''
})
const hostLabel = computed(() => (event.value?.host ?? '').trim())
const visibleTags = computed(() => (event.value?.tags ?? []).filter((tag) => tag.trim()))
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

/* 报名留言（选填）：仅在确认框内填写，随报名请求提交，后台审核可见 */
const enrollMessage = ref('')
/** 报名前绑定核验中（活动要求手机号/邮箱时先查一次当前用户资料，避免白填确认框） */
const bindingChecking = ref(false)

/** 该活动要求但当前账号未绑定的渠道（文案数组）；接口失败时返回空数组，交由服务端权威拦截 */
async function missingRequiredBindings(): Promise<string[]> {
  const ev = event.value
  if (!ev || (!ev.enrollRequirePhone && !ev.enrollRequireEmail)) return []
  bindingChecking.value = true
  try {
    const me = await fetchMe()
    const missing: string[] = []
    if (ev.enrollRequirePhone && !(me.phone ?? '').trim()) missing.push('手机号')
    if (ev.enrollRequireEmail && !(me.email ?? '').trim()) missing.push('邮箱')
    return missing
  } catch {
    return []
  } finally {
    bindingChecking.value = false
  }
}

async function onEnroll() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const ev = event.value
  if (!ev || acting.value || bindingChecking.value || disableReason.value) return
  /* 报名要求绑定手机号/邮箱：未绑定时先提示并引导去「账号与安全」（服务端仍会二次校验） */
  const missing = await missingRequiredBindings()
  if (missing.length) {
    confirmDialog({
      title: '报名需先完成绑定',
      content: `该活动报名需${missing.join('和')}，请先在「账号与安全」中完成绑定后再回来报名。`,
      cancelBtn: '稍后再说',
      confirmBtn: '去绑定',
      onConfirm: () => { void router.push('/me/security') },
    })
    return
  }
  enrollMessage.value = ''
  confirmDialog({
    title: '确认活动报名',
    content: () => h('div', { class: 'enroll-confirm', ref: onDialogContentRef }, [
      h('dl', { class: 'enroll-confirm-list' }, [
        infoRow('活动', ev.title),
        infoRow('开始', formatLocalDateTime(ev.startTime)),
        infoRow('结束', formatLocalDateTime(ev.endTime)),
        infoRow('地点', ev.location),
      ]),
      /* 留言（选填）：不用 TDesign 内建 label（弹窗窄宽度下会被截断），改由独立文案行承载 */
      h('div', { class: 'enroll-confirm-field' }, [
        h('span', { class: 'enroll-confirm-field-label' }, '留言（选填）'),
        h(Textarea, {
          modelValue: enrollMessage.value,
          'onUpdate:modelValue': (value: string) => { enrollMessage.value = value },
          /* 与站内其他文本域同一形态（浅灰填充、无边框），高度至少 3 行 */
          indicator: true,
          maxlength: 200,
          autosize: { minRows: 3, maxRows: 5 },
          placeholder: '有什么想提前告诉主办方的？',
        }),
      ]),
    ]),
    cancelBtn: '返回查看',
    confirmBtn: '确认报名',
    onConfirm: () => { void submitEnrollment() },
  })
}

/** 确认框信息行（键值对）：键固定宽度、值自动换行，样式见文件末尾非 scoped 样式块 */
function infoRow(key: string, value: string) {
  return h('div', { class: 'enroll-confirm-row' }, [
    h('dt', { class: 'enroll-confirm-key' }, key),
    h('dd', { class: 'enroll-confirm-value' }, value),
  ])
}

/** 弹窗内容挂载回调：把初始焦点从留言框移到对话框容器本身。
 * 应用层的 focusDialog 会聚焦弹层内首个可交互元素（即留言文本域），移动端会因此直接弹出软键盘；
 * 这里在首帧聚焦落地后再把焦点交给 `.t-dialog`（仍在弹层内，Tab 圈闭与关闭回焦行为不变）。 */
function onDialogContentRef(el: unknown) {
  const dialog = (el as HTMLElement | null)?.closest<HTMLElement>('.t-dialog') ?? null
  if (!dialog) return
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.tagName === 'TEXTAREA' && dialog.contains(active)) {
      dialog.setAttribute('tabindex', '-1')
      dialog.focus({ preventScroll: true })
    }
  }))
}

async function submitEnrollment() {
  if (acting.value) return
  acting.value = true
  try {
    const message = enrollMessage.value.trim()
    const res = await enrollEvent(eventId, message ? { message } : {})
    enrollmentResult.value = res
  } catch (e) {
    Toast(e instanceof Error ? e.message : '报名失败，请稍后重试')
  } finally {
    acting.value = false
  }
}

function onCancelEnrollment() {
  confirmDialog({
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

/* 与我的报名、服务端保持相同的取消时限及边界。 */
const cancelBlocked = computed(() => {
  const ev = event.value
  return !ev || !canCancelEnrollment({
    ...ev, status: myStatus.value, checkedIn: ev.myCheckedIn, eventStatus: ev.status,
  }, businessNowMs.value)
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
        <Image v-if="event.coverUrl" class="detail-cover content-img" :src="event.coverUrl" :alt="event.title" fit="cover" @error="onImageError" />
        <div class="head">
          <CategoryTag class="type-tag" :label="event.typeLabel" />
          <StateTag v-if="myStatus === 'pending'" kind="enroll" value="pending" />
          <StateTag v-else-if="myStatus === 'approved'" kind="enroll" value="approved" />
          <StateTag v-else-if="myStatus === 'waitlisted'" kind="enroll" value="waitlisted" />
          <StateTag v-else-if="myStatus === 'rejected'" kind="enroll" value="rejected" />
        </div>
        <h2 class="title">{{ event.title }}</h2>
        <p class="meta"><Icon aria-hidden="true" name="time" size="14px" />{{ formatLocalDateTime(event.startTime) }} ~ {{ formatLocalDateTime(event.endTime) }}</p>
        <p class="meta"><Icon aria-hidden="true" name="location" size="14px" />{{ event.location }}</p>
        <p v-if="speakerLabel" class="meta"><Icon aria-hidden="true" name="user" size="14px" />主讲嘉宾：{{ speakerLabel }}</p>
        <p v-if="hostLabel" class="meta"><Icon aria-hidden="true" name="building" size="14px" />主办方：{{ hostLabel }}</p>
        <p class="meta"><Icon aria-hidden="true" name="alarm" size="14px" />报名截止：{{ enrollmentDeadlineLabel }}</p>
        <p class="meta"><Icon aria-hidden="true" name="usergroup" size="14px" />限 {{ formatZhNumber(event.capacity) }} 人参加</p>
        <!-- 活动标签（报名要求标签由底部报名操作区在按钮上方呈现） -->
        <div v-if="visibleTags.length" class="tags-row">
          <Tag v-for="tag in visibleTags" :key="tag" size="small" variant="light" theme="primary">{{ tag }}</Tag>
        </div>
        <div class="fav-row">
          <Button size="small" variant="outline" @click="onToggleFavorite">
            <template #icon><span class="icon-swap"><Icon aria-hidden="true" name="star-filled" size="16px" :class="{ 'is-on': favorited }" /><Icon aria-hidden="true" name="star" size="16px" :class="{ 'is-on': !favorited }" /></span></template>
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
        <RichTextBlock class="desc" :class="{ 'desc-plain': descIsPlainText }" :html="event.description" />
      </section>

      <section v-if="isCancelled" class="m-card actions">
        <!-- 留言入口需登录（/me/messages 为登录页），游客保留原文案 -->
        <p v-if="auth.isLogged" class="hint">活动已取消，无需到场；如有疑问可<router-link class="contact-link" to="/me/messages">给社区留言</router-link>，工作人员会回复你。</p>
        <p v-else class="hint">活动已取消，无需到场；如有疑问请联系社区运营。</p>
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
  padding-bottom: var(--app-action-bar-clearance-lg);
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
  font: var(--app-type-caption);
}

.cancelled-banner {
  margin:0;
  padding:var(--app-space-5) var(--app-space-7);
  border-radius: var(--td-radius-large);
  background: var(--td-error-color-1);
  border: 1px solid var(--td-error-color);
  color: var(--td-error-color);
  font: var(--app-type-caption);
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
  font: var(--app-type-page-title);
}

.meta {
  margin:var(--app-space-3) 0;
  display: flex;
  align-items: center;
  gap:var(--app-space-2);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin:0 0 var(--app-space-4);
  font: var(--app-type-section);
}

/* 活动标签行：位于基础信息之后，与 meta 行保持同一纵向节奏 */
.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-4);
  margin-top: var(--app-space-5);
}

.desc {
  margin:0;
  font: var(--app-type-body-relaxed);
  color: var(--td-text-color-secondary);
}

/* 仅纯文本正文保留换行；富 HTML 分支不开 pre-wrap，避免源码缩进被渲染成多余空白 */
.desc-plain {
  white-space: pre-wrap;
}

/* 取消态「给社区留言」文字链 */
.contact-link {
  color: var(--td-brand-color);
}

</style>

<!-- 「确认活动报名」弹窗内容由 DialogPlugin 渲染在组件子树之外（h() 创建，不带 scoped 的 data-v 属性），
     故这些样式必须是非 scoped；类名前缀 enroll-confirm 仅本页使用，不会外溢到其他页面。 -->
<style>
.enroll-confirm {
  text-align: left;
}

.enroll-confirm-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.enroll-confirm-row {
  display: flex;
  gap: var(--app-space-5);
  font: var(--app-type-body);
}

.enroll-confirm-key {
  flex: none;
  width: 40px;
  margin: 0;
  color: var(--td-text-color-placeholder);
}

.enroll-confirm-value {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--td-text-color-primary);
  overflow-wrap: break-word;
}

.enroll-confirm-field {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  margin-top: var(--app-space-6);
}

.enroll-confirm-field-label {
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

/* 留言输入区：白底弹窗里用「浅灰填充」款（比库内默认白底文本域更有输入框辨识度），
 * 底色与圆角取站内既有 token，与搜索框/卡片底一致。 */
.enroll-confirm-field .t-textarea {
  --td-textarea-background-color: var(--td-bg-color-page);
  --td-textarea-padding: var(--app-space-5) var(--app-space-5) 0;
}

/* 不做焦点线框：浅灰填充本身已表明这是输入区，全局 :focus-visible 焦点环
 * （2px 描边 + 2px 偏移）在灰底上会形成一圈深色圆角框，视觉噪点明显（用户反馈要求移除）。
 * 文本域仍可正常 Tab 聚焦与输入（键盘可用性不受影响），仅不绘制额外的环。 */
.enroll-confirm-field .t-textarea__wrapper-inner:focus-visible {
  outline: none;
}
</style>
