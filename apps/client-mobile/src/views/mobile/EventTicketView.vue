<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, Loading, QRCode, Tag } from 'tdesign-mobile-vue'
import { fetchEventTicket } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 活动电子票：报名成功后生成凭证（核销二维码使用 TDesign QRCode，接入期为动态核销码）。 */
const route = useRoute()
const router = useRouter()
const { data: ticket, loading, error, run } = useAsyncList(() => fetchEventTicket(String(route.params.id)))
onMounted(run)

const statusText = computed(() => {
  if (!ticket.value) return ''
  if (ticket.value.status === 'cancelled') return '已失效（活动取消）'
  if (ticket.value.status === 'checked' || ticket.value.checkedIn) return '已核销'
  return ticket.value.waitlistOrder ? '候补中' : '有效'
})
const statusTheme = computed(() => {
  if (!ticket.value) return 'default'
  if (ticket.value.status === 'cancelled') return 'danger'
  if (ticket.value.status === 'checked' || ticket.value.checkedIn) return 'success'
  return ticket.value.waitlistOrder ? 'warning' : 'primary'
})

</script>

<template>
  <div class="page-fade-in ticket-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="ticket">
      <section class="ticket-card m-card" :class="{ invalid: ticket.status !== 'valid' }">
        <div class="ticket-head">
          <span class="brand">聚屿社区 · 活动电子票</span>
          <Tag :theme="statusTheme" variant="light" size="medium">{{ statusText }}</Tag>
        </div>
        <h2 class="event-title">{{ ticket.eventTitle }}</h2>
        <p class="info"><Icon name="time" size="16px" />{{ ticket.startTime }}</p>
        <p class="info"><Icon name="location" size="16px" />{{ ticket.location }}</p>
        <div class="qr-wrap">
          <QRCode :value="ticket.ticketCode" :size="140" level="M" aria-label="活动核销二维码" />
        </div>
        <p class="code">核销码：<code>{{ ticket.ticketCode }}</code></p>
        <p class="hint">
          <template v-if="ticket.status === 'cancelled'">活动已取消，凭证自动失效。</template>
          <template v-else-if="ticket.checkedIn">你已完成签到，感谢参与。</template>
          <template v-else-if="ticket.waitlistOrder">你当前为候补第 {{ ticket.waitlistOrder }} 位，递补成功后将自动转为有效票。</template>
          <template v-else>到场后出示此凭证，配合签到页完成核验。</template>
        </p>
      </section>
      <Button v-if="ticket.status === 'valid' && !ticket.waitlistOrder" theme="primary" block @click="router.push(`/events/${ticket.eventId}/check-in`)">去签到</Button>
      <Button variant="outline" block @click="router.push(`/events/${ticket.eventId}`)">查看活动详情</Button>
      <Button variant="text" block @click="router.push('/me/enrollments')">返回我的报名</Button>
    </template>
  </div>
</template>

<style scoped>
.ticket-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.ticket-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 16px;
  border: 1px dashed var(--td-brand-color);
  background: linear-gradient(160deg, var(--td-brand-color-1), var(--td-bg-color-container));
}

.ticket-card.invalid {
  border-color: var(--td-component-border);
  background: var(--td-bg-color-container);
  opacity: 0.75;
}

.ticket-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.event-title {
  margin: 4px 0;
  font-size: 18px;
  line-height: 1.4;
}

.info {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.qr-wrap {
  align-self: center;
  margin: 10px 0;
  padding: 10px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-default);
}

.code {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.code code {
  color: var(--td-text-color-primary);
  font-weight: 600;
  letter-spacing: 1px;
}

.hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}
</style>
