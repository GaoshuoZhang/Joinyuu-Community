<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { cancelEnrollment, fetchMyEnrollments } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
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
  return item.status === 'pending' || item.status === 'approved'
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
    <div v-if="loading" class="skeleton">加载中…</div>
    <section v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <Button variant="outline" size="small" @click="run">重试</Button>
    </section>
    <template v-else-if="(data ?? []).length > 0">
      <div v-for="item in data" :key="item.id" class="m-card">
        <div class="row">
          <a class="title" @click="router.push(`/events/${item.eventId}`)">{{ item.eventTitle }}</a>
          <StateTag kind="enroll" :value="item.status" />
        </div>
        <p class="meta">🕐 {{ item.startTime }} · 📍 {{ item.location }}</p>
        <div class="ops">
          <span v-if="item.checkedIn" class="checked">已签到</span>
          <a v-else-if="item.status === 'approved'" class="checkin-link" @click="router.push(`/events/${item.eventId}/check-in`)">去签到 ›</a>
          <span v-else class="placeholder" />
          <Button
            v-if="canCancel(item)"
            theme="danger"
            variant="outline"
            size="small"
            :disabled="actingId === item.id"
            @click="onCancelTap(item)"
          >
            {{ confirmingId === item.id ? '再点一次确认取消' : '取消报名' }}
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

.skeleton {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
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
  font-size: 11px;
  color: var(--td-text-color-secondary);
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
