<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading, Progress, Toast } from 'tdesign-mobile-vue'
import { cancelEnrollment, enrollEvent, fetchEvent } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommunityEvent } from '@/types'

/* 移动活动详情：单列信息 + 操作区按报名态/身份/容量/截止分流；取消报名直接按钮 + Toast */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const eventId = route.params.id as string

const { data: event, loading, error, run } = useAsyncList<CommunityEvent>(() => fetchEvent(eventId))
onMounted(run)

const acting = ref(false)

const isEnded = computed(() => event.value?.status === 'ended')
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
  const ev = event.value
  if (!ev) return ''
  if (!canEnrollSelf.value) return '当前身份不在该活动的可报名范围内'
  if (new Date(ev.enrollmentDeadline.replace(/-/g, '/')).getTime() < Date.now()) return '报名已截止'
  if (ev.approvedCount >= ev.capacity) return '活动名额已满'
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
    Toast(res.status === 'approved' ? '报名成功' : '已提交，待审核')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '报名失败，请稍后重试')
  } finally {
    acting.value = false
  }
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
</script>

<template>
  <div class="m-detail page-fade-in stagger">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="event">
      <p v-if="isEnded" class="ended-banner">该活动已结束</p>

      <section class="m-card">
        <div class="head">
          <span class="type-tag">{{ event.typeLabel }}</span>
          <StateTag v-if="myStatus === 'pending'" kind="enroll" value="pending" />
          <StateTag v-else-if="myStatus === 'approved'" kind="enroll" value="approved" />
        </div>
        <h1 class="title">{{ event.title }}</h1>
        <p class="meta">🕐 {{ event.startTime }} ~ {{ event.endTime }}</p>
        <p class="meta">📍 {{ event.location }}</p>
        <p class="meta">⏳ 报名截止：{{ event.enrollmentDeadline }}<span v-if="event.requireReview"> · 报名需审核</span></p>
        <div class="progress-block">
          <div class="progress-head">
            <span>报名进度</span>
            <span class="progress-num">{{ event.approvedCount }}/{{ event.capacity }}</span>
          </div>
          <Progress :percentage="progressPct" />
        </div>
      </section>

      <section class="m-card">
        <h3 class="sec-title">活动介绍</h3>
        <p class="desc">{{ event.description }}</p>
      </section>

      <section class="m-card actions">
        <template v-if="isEnded">
          <p class="hint">活动已结束，感谢关注。</p>
        </template>

        <template v-else-if="myStatus === 'pending'">
          <p class="status-line"><StateTag kind="enroll" value="pending" /><span>报名审核中，请耐心等待</span></p>
          <Button theme="default" variant="outline" block :disabled="acting" @click="onCancel">取消报名</Button>
        </template>

        <template v-else-if="myStatus === 'approved'">
          <p v-if="myCheckedIn" class="status-line ok">✅ 已签到</p>
          <p v-else class="status-line"><span>报名已通过，记得准时参加</span></p>
          <Button v-if="!myCheckedIn" theme="primary" block :disabled="acting" @click="goCheckIn">签到</Button>
          <Button theme="default" variant="outline" block :disabled="acting" @click="onCancel">取消报名</Button>
        </template>

        <template v-else>
          <Button v-if="!auth.isLogged" theme="primary" block @click="onEnroll">登录后报名</Button>
          <Button v-else theme="primary" block :disabled="acting || !!disableReason" @click="onEnroll">
            {{ acting ? '报名中…' : '立即报名' }}
          </Button>
          <p v-if="auth.isLogged && disableReason" class="disable-reason">{{ disableReason }}</p>
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

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.type-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.title {
  margin: 0 0 12px;
  font-size: 18px;
  line-height: 1.4;
}

.meta {
  margin: 5px 0;
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
