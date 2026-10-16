<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, Input, QRCode, Result, Toast } from 'tdesign-mobile-vue'
import { checkInEvent, fetchEvent, fetchEventTicket } from '@/api/events'
import { getCaptcha } from '@/api/auth'
import { getPosition } from '@/utils/geolocation'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import CaptchaField from '@/components/CaptchaField.vue'
import type { CheckinResult, CommunityEvent, EventTicket } from '@/types'
import type { GeoPosition } from '@/utils/geolocation'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动签到：在同一页面提供电子票、定位签到与核销状态。
 * 按钮文案按开关组合：位置校验开=「获取定位并签到」；仅码（或无校验）=「签到」。
 * 签到码启用时需输 6 位码（扫码从 ?code= 自动预填）；连续错误 4 次起需图形验证码（防爆破）。 */
const route = useRoute()
const router = useRouter()
const eventId = route.params.id as string

const event = ref<CommunityEvent | null>(null)
const ticket = ref<EventTicket | null>(null)
const ticketError = ref('')
const loading = ref(true)
const error = ref('')

/* 签到码：二维码 URL 携带 ?code= 时自动预填（启用码功能时扫码即可直接签到） */
const checkinCode = ref(String(route.query.code ?? '').trim())
/* 防爆破：服务端 428 后要求图形验证码 */
const captchaRequired = ref(false)
const captchaId = ref('')
const captchaImage = ref('')
const captchaLoading = ref(false)
const captchaCode = ref('')

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
const failMessage = ref('')
const checkinResult = ref<CheckinResult | null>(null)
const acting = ref(false)

/* 开关礼组合：位置校验决定是否需要定位；码启用决定是否需要输 6 位码 */
const needsLocation = computed(() => event.value?.checkinLocationRequired === true)
const needsCode = computed(() => event.value?.checkinCodeEnabled === true)

/* 输入条件：码启用时必须凑满 6 位；进入验证码流程后必须填验证码 */
const inputReady = computed(() => {
  if (!needsCode.value && !captchaRequired.value) return true
  if (needsCode.value && checkinCode.value.trim().length !== 6) return false
  if (captchaRequired.value && captchaCode.value.trim().length < 4) return false
  return true
})

const buttonText = computed(() => {
  if (phase.value === 'locating') return '正在获取定位…'
  if (phase.value === 'verifying') return needsLocation.value ? '正在校验距离…' : '正在签到…'
  return needsLocation.value ? '获取定位并签到' : '签到'
})

async function refreshCaptcha() {
  if (captchaLoading.value) return
  captchaLoading.value = true
  captchaCode.value = ''
  try {
    const captcha = await getCaptcha()
    captchaId.value = captcha.captchaId
    captchaImage.value = captcha.image
  } catch (e) {
    Toast(e instanceof Error ? e.message : '验证码加载失败，请重试')
  } finally {
    captchaLoading.value = false
  }
}

async function startCheckIn() {
  if (acting.value) return
  failMessage.value = ''
  let lat: number | undefined
  let lng: number | undefined
  if (needsLocation.value) {
    phase.value = 'locating'
    try {
      position.value = await getPosition()
      lat = position.value.lat
      lng = position.value.lng
    } catch (e) {
      phase.value = 'failed'
      failMessage.value = e instanceof Error ? e.message : '定位失败，请稍后重试'
      Toast(failMessage.value)
      return
    }
    geoHint.value = ''
  }
  phase.value = 'verifying'
  acting.value = true
  try {
    const res = await checkInEvent(eventId, {
      ...(needsLocation.value && lat != null && lng != null ? { lat, lng } : {}),
      ...(needsCode.value ? { code: checkinCode.value.trim() } : {}),
      ...(captchaRequired.value ? { captchaId: captchaId.value, captchaCode: captchaCode.value.trim() } : {}),
    })
    checkinResult.value = res
    if (event.value) event.value.myCheckedIn = true
    if (ticket.value) {
      ticket.value = { ...ticket.value, status: 'checked', checkedIn: true }
    }
    captchaRequired.value = false
    captchaCode.value = ''
    phase.value = 'success'
  } catch (e) {
    if (e instanceof ApiError && e.code === 428) {
      /* 签到码连续错误 5 次：进入图形验证码流程 */
      captchaRequired.value = true
      phase.value = 'idle'
      failMessage.value = e.message
      Toast(e.message)
      void refreshCaptcha()
    } else {
      phase.value = 'failed'
      failMessage.value = e instanceof Error ? e.message : '签到失败，请稍后重试'
    }
  } finally {
    acting.value = false
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
        <p class="meta"><Icon aria-hidden="true" name="time" size="14px" />{{ formatLocalDateTime(ticket.startTime) }}</p>
        <p class="meta"><Icon aria-hidden="true" name="location" size="14px" />{{ ticket.location }}</p>
        <div class="qr-wrap"><QRCode :value="ticket.ticketCode" :size="140" level="M" :status="qrStatus" aria-label="活动核销二维码" /></div>
        <p class="code">核销码：<code translate="no">{{ ticket.ticketCode }}</code></p>
        <p class="ticket-hint">
          <template v-if="ticket.status === 'cancelled'">活动已取消，凭证自动失效。</template>
          <template v-else-if="ticket.status === 'expired'">活动已结束，未核销凭证已失效。</template>
          <template v-else-if="ticket.checkedIn || ticket.status === 'checked'">你已完成签到，感谢参与。</template>
          <template v-else-if="ticket.waitlistOrder">你当前为候补第 {{ formatZhNumber(ticket.waitlistOrder) }} 位，递补成功后将自动转为有效票。</template>
          <template v-else>到场后出示此凭证，并在下方完成签到。</template>
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
        <template v-else-if="phase === 'success' && checkinResult">
          <!-- 签到成功反馈：活动信息 + 第 N 位 + 奖励积分到账，引导情绪 -->
          <Result theme="success" title="签到成功">
            <template #description>
              <p class="success-event">{{ checkinResult.title }}</p>
              <p class="success-time">{{ formatLocalDateTime(checkinResult.startTime) }} ~ {{ formatLocalDateTime(checkinResult.endTime) }}</p>
              <p class="success-points">您是第 {{ formatZhNumber(checkinResult.position) }} 位签到 · 积分 +{{ formatZhNumber(checkinResult.pointsAwarded) }} 已到账</p>
              <p class="success-tip">已记录本次签到，记得准时参加活动哦。</p>
            </template>
          </Result>
          <Button theme="default" variant="outline" @click="backToDetail">返回活动详情</Button>
        </template>

        <template v-else-if="canCheckIn()">
          <p v-if="position" class="coord">已获取定位：{{ position.lat.toFixed(5) }}, {{ position.lng.toFixed(5) }}</p>
          <p v-else-if="geoHint" class="geo-hint">{{ geoHint }}</p>
          <p v-if="phase === 'failed' && failMessage" class="fail">{{ failMessage }}</p>
          <p v-else-if="captchaRequired && failMessage" class="fail">{{ failMessage }}</p>

          <!-- 签到码：码启用时必填（扫二维码 ?code= 自动预填） -->
          <div v-if="needsCode" class="field">
            <label for="checkin-code">签到码</label>
            <Input
              id="checkin-code"
              v-model="checkinCode"
              type="number"
              :maxlength="6"
              :spell-check="false"
              placeholder="请输入 6 位签到码…"
              class="checkin-code-input"
            />
          </div>

          <!-- 连续输错 5 次后：图形验证码（刷新按钮换一张） -->
          <div v-if="captchaRequired" class="field">
            <CaptchaField v-model="captchaCode" :image="captchaImage" :loading="captchaLoading" label="验证码" @refresh="refreshCaptcha" />
          </div>

          <Button
            theme="primary"
            block
            :disabled="phase === 'locating' || phase === 'verifying' || acting || !inputReady"
            @click="startCheckIn"
          >
            {{ buttonText }}
          </Button>
          <p class="tip">
            <template v-if="needsLocation">签到需在活动签到时间窗内、距场地 {{ formatZhNumber(event.checkinRadiusM) }} 米以内完成。</template>
            <template v-else>签到需在活动签到时间窗内完成。</template>
          </p>
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
  font: var(--app-type-card-title);
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
  font: var(--app-type-caption);
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
  font: var(--app-type-emphasis-sm);
  letter-spacing: 1px;
}

.meta {
  margin:var(--app-space-3) 0;
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-2);
  font: var(--app-type-caption);
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
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.geo-hint {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.fail {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

.tip {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.success-title {
  margin:0;
  font: var(--app-type-page-title);
  color: var(--td-success-color);
}

.success-event {
  margin:0;
  font: var(--app-type-emphasis);
  color: var(--td-text-color-primary);
}

.success-time {
  margin:var(--app-space-2) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.success-points {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-emphasis);
  color: var(--td-brand-color);
}

.success-tip {
  margin:0 0 var(--app-space-4);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* 签到码/验证码输入：与票面同宽，标签可点击聚焦（label 与输入联动） */
.field {
  width: 100%;
  margin:0;
  text-align: left;
}

.field > label {
  display: block;
  margin-bottom: var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.field > label::after {
  content: ' *';
  color: var(--td-error-color);
}
</style>