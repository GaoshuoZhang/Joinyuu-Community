<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, QRCode, Result, Toast } from 'tdesign-mobile-vue'
import { checkInEvent, fetchEvent, fetchEventTicket } from '@/api/events'
import { getPosition } from '@/utils/geolocation'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { CommunityEvent, EventTicket } from '@/types'
import type { GeoPosition } from '@/utils/geolocation'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动签到：在同一页面提供电子票、定位签到与核销状态。 */
const route = useRoute()
const router = useRouter()
const eventId = route.params.id as string

const event = ref<CommunityEvent | null>(null)
const ticket = ref<EventTicket | null>(null)
const ticketError = ref('')
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  ticketError.value = ''
  /* allSettled：活动信息失败才整页报错；电子票失败（如报名未通过 400）降级为页面内提示 */
  const [eventResult, ticketResult] = await Promise.allSettled([fetchEvent(eventId), fetchEventTicket(eventId)])
  if (eventResult.status === 'fulfilled') {
    event.value = eventResult.value
  } else {
    event.value = null
    error.value = eventResult.reason instanceof Error ? eventResult.reason.message : '签到信息加载失败，请稍后重试'
  }
  if (ticketResult.status === 'fulfilled') {
    ticket.value = ticketResult.value
  } else {
    ticket.value = null
    ticketError.value = ticketResult.reason instanceof Error ? ticketResult.reason.message : '暂无电子票'
  }
  loading.value = false
}

onMounted(load)

const phase = ref<'idle' | 'locating' | 'verifying' | 'success' | 'failed'>('idle')
const position = ref<GeoPosition | null>(null)
const geoHint = ref('')
const pointsAwarded = ref(0)
const failMessage = ref('')

async function startCheckIn() {
  phase.value = 'locating'
  failMessage.value = ''
  try {
    position.value = await getPosition()
  } catch (e) {
    phase.value = 'failed'
    failMessage.value = e instanceof Error ? e.message : '定位失败，请稍后重试'
    Toast(failMessage.value)
    return
  }
  geoHint.value = ''
  phase.value = 'verifying'
  try {
    const res = await checkInEvent(eventId, { lat: position.value.lat, lng: position.value.lng })
    pointsAwarded.value = res.pointsAwarded
    if (event.value) event.value.myCheckedIn = true
    if (ticket.value) {
      ticket.value = { ...ticket.value, status: 'checked', checkedIn: true }
    }
    phase.value = 'success'
  } catch (e) {
    phase.value = 'failed'
    failMessage.value = e instanceof Error ? e.message : '签到失败，请稍后重试'
  }
}

function backToDetail() {
  router.push(`/events/${eventId}`)
}

/* 票状态统一交由 StateTag 的 ticket 状态集承载，页面不再自造文案与配色；
 * 失效原因等补充说明由票面下方的一行说明文案承担。 */
const ticketState = computed(() => {
  const t = ticket.value
  if (!t) return 'valid'
  if (t.status === 'cancelled') return 'cancelled'
  if (t.status === 'expired') return 'expired'
  if (t.checkedIn || t.status === 'checked') return 'checked'
  if (t.waitlistOrder) return 'waitlisted'
  return 'valid'
})

/* 二维码状态（TDesign QRCode 仅 active/expired/loading/scanned 四态）：
 * 已失效（活动取消/结束）与候补中的凭证都不可核销，统一按「失效」呈现，避免扫码时才发现不可用。 */
const qrStatus = computed<'active' | 'expired' | 'scanned'>(() => {
  const t = ticket.value
  if (!t) return 'expired'
  if (t.status === 'cancelled' || t.status === 'expired' || t.waitlistOrder) return 'expired'
  if (t.checkedIn || t.status === 'checked') return 'scanned'
  return 'active'
})

const canCheckIn = () => Boolean(
  event.value
  && ticket.value
  && ticket.value.status === 'valid'
  && !ticket.value.waitlistOrder
  && !ticket.value.checkedIn
  && !event.value.myCheckedIn,
)
</script>

<template>
  <div class="m-checkin page-fade-in stagger">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />
    <template v-else-if="event">
      <section v-if="ticket" class="ticket-card m-card" :class="{ invalid: ticket.status !== 'valid' }">
        <div class="ticket-head">
          <span class="brand" translate="no">聚屿社区 · 活动签到</span>
          <StateTag kind="ticket" :value="ticketState" />
        </div>
        <h2 class="title">{{ ticket.eventTitle }}</h2>
        <p class="meta"><Icon aria-hidden="true" name="time" size="16px" />{{ formatLocalDateTime(ticket.startTime) }}</p>
        <p class="meta"><Icon aria-hidden="true" name="location" size="16px" />{{ ticket.location }}</p>
        <div class="qr-wrap"><QRCode :value="ticket.ticketCode" :size="140" level="M" :status="qrStatus" aria-label="活动核销二维码" /></div>
        <p class="code">核销码：<code translate="no">{{ ticket.ticketCode }}</code></p>
        <p class="ticket-hint">
          <template v-if="ticket.status === 'cancelled'">活动已取消，凭证自动失效。</template>
          <template v-else-if="ticket.status === 'expired'">活动已结束，未核销凭证已失效。</template>
          <template v-else-if="ticket.checkedIn || ticket.status === 'checked'">你已完成签到，感谢参与。</template>
          <template v-else-if="ticket.waitlistOrder">你当前为候补第 {{ formatZhNumber(ticket.waitlistOrder) }} 位，递补成功后将自动转为有效票。</template>
          <template v-else>到场后出示此凭证，并在下方完成定位签到。</template>
        </p>
      </section>

      <section v-else class="m-card stage">
        <p class="title">暂无电子票</p>
        <p class="ticket-hint">{{ ticketError || '暂无电子票，报名通过后可在此查看' }}</p>
        <Button variant="outline" @click="backToDetail">返回活动详情</Button>
      </section>

      <section v-if="canCheckIn() || event.myCheckedIn || phase === 'success'" class="m-card stage">
        <template v-if="event.myCheckedIn && phase !== 'success'">
          <p class="success-title">你已完成签到</p>
          <Button variant="outline" @click="backToDetail">返回活动详情</Button>
        </template>
        <template v-else-if="phase === 'success'">
          <Result theme="success" title="签到成功">
            <template #description>
              <p class="success-points">积分 +{{ formatZhNumber(pointsAwarded) }}</p>
              <p class="success-tip">已记录本次签到，记得准时参加活动哦。</p>
            </template>
          </Result>
          <Button theme="default" variant="outline" @click="backToDetail">返回活动详情</Button>
        </template>

        <template v-else-if="canCheckIn()">
          <p v-if="position" class="coord">已获取定位：{{ position.lat.toFixed(5) }}, {{ position.lng.toFixed(5) }}</p>
          <p v-else-if="geoHint" class="geo-hint">{{ geoHint }}</p>
          <p v-if="phase === 'failed' && failMessage" class="fail">{{ failMessage }}</p>

          <Button
            theme="primary"
            block
            :disabled="phase === 'locating' || phase === 'verifying'"
            @click="startCheckIn"
          >
            {{ phase === 'locating' ? '正在获取定位…' : phase === 'verifying' ? '正在校验距离…' : '获取定位并签到' }}
          </Button>
          <p class="tip">签到需在活动签到时间窗内、距场地 {{ formatZhNumber(event.checkinRadiusM) }} 米以内完成。</p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-checkin {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.title {
  margin:0 0 var(--app-space-5);
  font-size: var(--app-font-subtitle);
  line-height: 1.4;
}

.ticket-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
  padding: var(--app-space-10) var(--app-space-8);
  border: 1px dashed var(--td-brand-color);
}

.ticket-card.invalid {
  border-color: var(--td-component-border);
  opacity: 0.75;
}

.ticket-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.brand,
.ticket-hint,
.code {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.qr-wrap {
  align-self: center;
  margin: var(--app-space-4) 0;
  padding: var(--app-space-5);
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-default);
}

.code {
  text-align: center;
}

.code code {
  color: var(--td-text-color-primary);
  font-weight: 600;
  letter-spacing: 1px;
}

.meta {
  margin:var(--app-space-3) 0;
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-2);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap:var(--app-space-6);
  padding: var(--app-space-9);
  text-align: center;
}

.coord {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.geo-hint {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.fail {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
  line-height: 1.6;
}

.tip {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.success-title {
  margin:0;
  font-size: var(--app-font-title);
  font-weight: 600;
  color: var(--td-success-color);
}

.success-points {
  margin:0;
  font-size: var(--app-font-body);
  color: var(--td-brand-color);
  font-weight: 600;
}

.success-tip {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}
</style>
