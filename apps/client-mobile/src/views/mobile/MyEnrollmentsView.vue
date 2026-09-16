<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { cancelEnrollment, fetchMyEnrollments } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyEnrollmentItem } from '@/types'

/* 移动我的报名：报名卡片 + 签到入口/已签到标识；取消报名二次确认（两段式按钮）+ Toast */
const router = useRouter()

const { data, loading, error, run } = useAsyncList<MyEnrollmentItem[]>(() => fetchMyEnrollments())
onMounted(run)

const actingId = ref('')
const confirmingId = ref('')
let confirmTimer: ReturnType<typeof setTimeout> | null = null

function canCancel(item: MyEnrollmentItem) {
  /* v38：候补中可随时退出；正式报名开始前 24 小时内不可取消（由服务端校验并返回原因） */
  return item.status === 'pending' || item.status === 'approved' || item.status === 'waitlisted'
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
  <div class="m-enrollments page-fade-in stagger">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="(data ?? []).length > 0">
      <p class="list-count">共 {{ (data ?? []).length }} 条报名</p>
      <div v-for="item in data" :key="item.id" class="m-card">
        <div class="row">
          <a class="title" @click="router.push(`/events/${item.eventId}`)">{{ item.eventTitle }}</a>
          <StateTag kind="enroll" :value="item.status" />
        </div>
        <p class="meta">🕐 {{ item.startTime }} · 📍 {{ item.location }}</p>
        <p v-if="item.status === 'waitlisted'" class="waitlist-note">
          候补中{{ item.waitlistOrder ? `（第 ${item.waitlistOrder} 位）` : '' }}，有空位将自动递补并通知你
        </p>
        <p v-if="item.eventStatus === 'cancelled'" class="cancel-note">活动已取消，报名已同步取消</p>
        <p v-else-if="item.rescheduledTo" class="waitlist-note">活动改期至 {{ item.rescheduledTo }}</p>
        <p v-if="item.rejectReason" class="reject-reason">驳回原因：{{ item.rejectReason }}</p>
        <div class="ops">
          <span v-if="item.checkedIn" class="checked">已签到</span>
          <a v-else-if="item.status === 'approved'" class="checkin-link" v-pressable @click="router.push(`/events/${item.eventId}/check-in`)">去签到 ›</a>
          <span v-else class="placeholder" />
          <a v-if="item.status === 'approved' || item.checkedIn" class="checkin-link" v-pressable @click="router.push(`/events/${item.eventId}/ticket`)">电子票 ›</a>
          <Button
            v-if="canCancel(item)"
            theme="danger"
            variant="outline"
            size="small"
            :disabled="actingId === item.id"
            @click="onCancelTap(item)"
          >
            {{ confirmingId === item.id ? '再点一次确认取消' : item.status === 'waitlisted' ? '退出候补' : '取消报名' }}
          </Button>
        </div>
      </div>
    </template>
    <template v-else>
      <EmptyBlock text="暂无报名记录" />
      <Button theme="primary" class="go-events" @click="router.push('/events')">去看看活动 ›</Button>
    </template>
  </div>
</template>

<style scoped>
.m-enrollments {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.error-box {
  text-align: center;
  color: var(--td-error-color);
  font-size: 12px;
}

.error-box p {
  margin: 0 0 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.reject-reason {
  margin: 0 0 10px;
  color: var(--td-error-color);
  font-size: 12px;
}

.waitlist-note {
  margin: 0 0 10px;
  color: var(--td-brand-color);
  font-size: 12px;
}

.cancel-note {
  margin: 0 0 10px;
  color: var(--td-error-color);
  font-size: 12px;
}

.ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.checked {
  font-size: 12px;
  color: var(--td-success-color);
}

.checkin-link {
  font-size: 12px;
  color: var(--td-brand-color);
  cursor: pointer;
}

.placeholder {
  flex: 1;
}

.go-events {
  align-self: center;
}
</style>
