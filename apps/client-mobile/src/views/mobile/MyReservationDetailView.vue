<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchMyReservation } from '@/api/spaces'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { SpaceReservationDetail } from '@/types'
import { formatLocalDate, formatLocalDateTime, formatZhNumber } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const { data: reservation, loading, error, run } = useAsyncList<SpaceReservationDetail>(() => fetchMyReservation(id))
onMounted(run)
</script>

<template>
  <div class="detail-page page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="reservation">
      <section class="m-card hero">
        <div class="head"><h2>{{ reservation.spaceName }}</h2><StateTag kind="reservation" :value="reservation.status" /></div>
        <p>{{ formatLocalDate(reservation.date) }} · {{ reservation.start }} - {{ reservation.end }}</p>
        <p>编号 {{ reservation.id }} · 提交于 {{ formatLocalDateTime(reservation.createdAt) }}</p>
      </section>
      <section class="m-card section">
        <h3>预约信息</h3>
        <dl class="fields">
          <dt>预约用途</dt><dd>{{ reservation.purpose || '未填写' }}</dd>
          <dt>参与人数</dt><dd>{{ formatZhNumber(reservation.attendees) }} 人</dd>
          <template v-if="reservation.identityType"><dt>预约身份</dt><dd class="identity"><IdentityTag :type="reservation.identityType" /><span>{{ reservation.subjectName }}</span></dd></template>
        </dl>
      </section>
      <section v-if="reservation.rejectReason" class="m-card section reject"><h3>审核意见</h3><p>{{ reservation.rejectReason }}</p></section>
      <section v-if="reservation.records.length" class="m-card section">
        <h3>处理进度</h3>
        <ol class="timeline">
          <li v-for="(record, index) in reservation.records" :key="`${record.at}-${index}`">
            <b>{{ record.title }}</b><span>{{ formatLocalDateTime(record.at) }}</span>
            <p v-if="record.text">{{ record.text }}</p><small v-if="record.operator">操作人：{{ record.operator }}</small>
          </li>
        </ol>
      </section>
      <Button block variant="text" @click="router.push('/me/reservations')">返回我的预约</Button>
    </template>
  </div>
</template>

<style scoped>
.detail-page { padding: var(--app-space-8); display: flex; flex-direction: column; gap: var(--app-space-5); }
.hero, .section { display: flex; flex-direction: column; gap: var(--app-space-4); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--app-space-4); }
h2, h3, p { margin: 0; }
h2 { min-width: 0; font-size: var(--app-font-subtitle); line-height: 1.45; }
h3 { font-size: var(--app-font-body); }
.hero p { font-size: var(--app-font-caption); color: var(--td-text-color-secondary); }
.fields { display: grid; grid-template-columns: 76px 1fr; gap: var(--app-space-4); margin: 0; font-size: var(--app-font-body); }
.fields dt { color: var(--td-text-color-placeholder); }
.fields dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.identity { display: flex; align-items: center; flex-wrap: wrap; gap: var(--app-space-2); }
.reject { border-color: var(--td-error-color-3); }
.reject p { font-size: var(--app-font-body); line-height: 1.7; color: var(--td-error-color); }
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li { position: relative; padding: 0 0 var(--app-space-5) var(--app-space-7); border-left: 1px solid var(--td-component-border); }
.timeline li:last-child { padding-bottom: 0; }
.timeline li::before { content: ''; position: absolute; left: -5px; top: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--td-brand-color); }
.timeline b, .timeline span { display: block; font-size: var(--app-font-caption); }
.timeline span, .timeline small { color: var(--td-text-color-placeholder); }
.timeline p { margin-top: var(--app-space-2); font-size: var(--app-font-caption); line-height: 1.6; color: var(--td-text-color-secondary); }
</style>
