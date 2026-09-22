<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, List, Toast } from 'tdesign-mobile-vue'
import { cancelEnrollment, fetchMyEnrollments } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyEnrollmentItem, PageResult } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动我的报名：报名卡片 + 签到入口/已签到标识；取消报名二次确认（两段式按钮）+ Toast */
const { data, loading, error, run } = useAsyncList<PageResult<MyEnrollmentItem>>(() => fetchMyEnrollments())
const router = useRouter()
const enrollments = computed(() => data.value?.list ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(enrollments)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
onMounted(run)

const actingId = ref('')
const confirmingId = ref('')
let confirmTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = null
})

function canCancel(item: MyEnrollmentItem) {
  /* v38：候补中可随时退出；正式报名开始前 24 小时内不可取消（由服务端校验并返回原因） */
  return !item.checkedIn && (item.status === 'pending' || item.status === 'approved' || item.status === 'waitlisted')
}

function onCancelTap(item: MyEnrollmentItem) {
  if (confirmingId.value !== item.id) {
    confirmingId.value = item.id
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => {
      confirmingId.value = ''
    }, 3000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmingId.value = ''
  doCancel(item)
}

async function doCancel(item: MyEnrollmentItem) {
  actingId.value = item.id
  try {
    await cancelEnrollment(item.eventId)
    Toast('已取消报名')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
  } finally {
    actingId.value = ''
  }
}
</script>

<template>
  <div class="m-enrollments page-fade-in">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <List v-else-if="enrollments.length > 0" class="stagger list" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
      <p class="list-count">共 {{ formatZhNumber(enrollments.length) }} 条报名</p>
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="m-card enrollment-card"
        role="link"
        tabindex="0"
        @click="router.push(`/events/${item.eventId}`)"
        @keydown.enter.self="router.push(`/events/${item.eventId}`)"
      >
        <div class="row">
          <h2 class="title">{{ item.eventTitle }}</h2>
          <StateTag kind="enroll" :value="item.status" />
        </div>
        <p class="meta"><Icon aria-hidden="true" name="time" size="14px" />{{ formatLocalDateTime(item.startTime) }} · <Icon aria-hidden="true" name="location" size="14px" />{{ item.location }}</p>
        <p v-if="item.status === 'waitlisted'" class="waitlist-note">
          {{ item.waitlistOrder ? `当前第 ${formatZhNumber(item.waitlistOrder)} 位，` : '' }}有空位将自动递补并通知你
        </p>
        <p v-if="item.eventStatus === 'cancelled'" class="cancel-note">活动已取消，报名已同步取消</p>
        <p v-else-if="item.rescheduledTo" class="waitlist-note">活动改期至 {{ formatLocalDateTime(item.rescheduledTo) }}</p>
        <p v-if="item.rejectReason" class="reject-reason">驳回原因：{{ item.rejectReason }}</p>
        <div class="ops">
          <router-link v-if="item.status === 'approved' || item.checkedIn" class="checkin-link" :to="`/events/${item.eventId}/check-in`" @click.stop>
            {{ item.checkedIn ? '查看签到' : '签到' }}<Icon aria-hidden="true" name="chevron-right" size="12px" />
          </router-link>
          <Button
            v-if="canCancel(item)"
            theme="danger"
            variant="outline"
            size="small"
            :disabled="actingId === item.id"
            @click.stop="onCancelTap(item)"
          >
            {{ confirmingId === item.id ? '再点一次确认取消' : item.status === 'waitlisted' ? '退出候补' : '取消报名' }}
          </Button>
        </div>
      </div>
    </List>
    <template v-else>
      <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同（单一主入口，不再叠加同义 CTA） -->
      <EmptyBlock text="暂无报名记录" />
      <Button theme="primary" block @click="router.push('/plaza?tab=events')">去看看活动</Button>
    </template>
  </div>
</template>

<style scoped>
.m-enrollments {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
  margin-bottom:var(--app-space-3);
}

.title {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  font-size: var(--app-font-body);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
}

.enrollment-card { cursor: pointer; }
.enrollment-card:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }

.meta {
  display: flex;
  align-items: center;
  gap:var(--app-space-2);
  margin:0 0 var(--app-space-6);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.reject-reason {
  margin:0 0 var(--app-space-5);
  color: var(--td-error-color);
  font-size: var(--app-font-caption);
}

.waitlist-note {
  margin:0 0 var(--app-space-5);
  color: var(--td-brand-color);
  font-size: var(--app-font-caption);
}

.cancel-note {
  margin:0 0 var(--app-space-5);
  color: var(--td-error-color);
  font-size: var(--app-font-caption);
}

.ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
}

/* 仅一个操作时（如待审核只有「取消报名」）右对齐，与「签到 + 取消报名」的取消按钮位置一致 */
.ops > :only-child {
  margin-left: auto;
}

.checkin-link {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-1);
  min-height: 44px;
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
  text-decoration: none;
  cursor: pointer;
}
</style>
