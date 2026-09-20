<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Input, Switch } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { mockAdvanceOrder } from '@/api/mall'
import { accounts, analyticsCounters, appConfig, events, ordersByUid } from '@/mock/db'
import { listPendingReviews, reviewPending } from '@/mock/operations'
import type { MockReviewItem, MockReviewVerdict } from '@/mock/operations'
import { cancelEventAsOps, postponeEventAsOps } from '@/mock/operations'
import {
  advanceMockNow,
  commitMockState,
  formatMockStamp,
  getMockNetworkMode,
  getPersistenceError,
  parseMockStamp,
  resetMockState,
  setMockNetworkMode,
  setMockNow,
} from '@/mock/runtime'
import type { MockNetworkMode } from '@/mock/runtime'

/* [MOCK-ONLY] 开发者工具（仅 mock 模式挂载，接入期随 mock 目录退役）：
 * 1. 演示账号一键切换  2. 功能开关实时覆写  3. 签到场景（位置注入 + 时间窗对齐）
 * 4. 订单场景  5. v33 网络/时钟控制与运营审核  6. 版本化状态重置 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()

const open = ref(false)
const busy = ref('')
const status = ref('')
const reviewReason = ref('资料不完整，请补充后重新提交')
const reviewQueue = ref<MockReviewItem[]>([])
const networkMode = ref<MockNetworkMode>(getMockNetworkMode())
const clockText = ref(formatMockStamp())
const switchKeys = ['registrationOpen', 'mallOpen', 'demandOpen', 'reservationOpen'] as const
const networkModes: { value: MockNetworkMode; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'slow', label: '慢网' },
  { value: 'offline', label: '离线' },
  { value: 'error', label: '500' },
  { value: 'timeout', label: '超时' },
]

const accountItems = computed(() => accounts.map((a) => ({ phone: a.phone, label: `${a.nickname} · ${a.phone}`, frozen: a.status === 'frozen' })))
const FUNNEL_KEYS = ['login', 'register', 'demand_publish', 'demand_respond', 'event_enroll', 'event_checkin', 'order_create', 'article_submit', 'reservation_create', 'favorite_add', 'search']
const funnel = computed(() => FUNNEL_KEYS.map((key) => ({ key, count: analyticsCounters[key] ?? 0 })))

let statusTimer: number | undefined
function flash(msg: string) {
  status.value = msg
  window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => {
    status.value = ''
  }, 2400)
}

async function switchAccount(phone: string) {
  busy.value = phone
  try {
    await auth.login({ phone, password: 'client123', captchaCode: '8888' })
    await notices.refreshAll()
    flash(`已切换为「${auth.name}」`)
    await router.push('/')
  } catch (error) {
    flash(error instanceof Error ? error.message : '账号切换失败')
  } finally {
    busy.value = ''
  }
}

function onToggle(key: (typeof switchKeys)[number], value: boolean | number) {
  const next = Boolean(value)
  config.override({ [key]: next })
  /* [MOCK-ONLY] 同步 mock 业务门禁：保证「入口隐藏」与「写端点 400 文案」行为一致 */
  appConfig[key] = next
  commitMockState()
}

function refreshReviewQueue() {
  reviewQueue.value = listPendingReviews()
}

watch(open, (value) => {
  if (value) refreshReviewQueue()
})

function changeNetwork(mode: MockNetworkMode) {
  setMockNetworkMode(mode)
  networkMode.value = mode
  flash(`网络场景已切换为「${networkModes.find((item) => item.value === mode)?.label}」`)
}

function moveClock(minutes: number) {
  advanceMockNow(minutes)
  clockText.value = formatMockStamp()
  flash(`Mock 时间：${clockText.value}`)
}

/* ---- 签到场景：位置注入（utils/geolocation.ts 优先读取 window.__mockGeolocation） ---- */
type GeoInject = 'inside' | 'outside' | 'denied' | 'clear'

function injectLocation(kind: GeoInject) {
  if (kind === 'clear') {
    delete window.__mockGeolocation
    flash('已清除位置注入（改用浏览器真实定位）')
    return
  }
  if (kind === 'denied') {
    window.__mockGeolocation = 'denied'
    flash('已模拟「定位权限被拒绝」')
    return
  }
  const venue = events[0]
  window.__mockGeolocation =
    kind === 'inside'
      ? { lat: venue.venueLat, lng: venue.venueLng }
      : { lat: venue.venueLat + 0.0045, lng: venue.venueLng }
  flash(kind === 'inside' ? '已注入位置：签到主场地内' : '已注入位置：场地外约 500 米')
}

/* ---- 签到场景：移动 Mock 时钟进入 EV6001 签到窗口，不再篡改活动数据 ---- */
function alignCheckinWindow() {
  const ev = events.find((e) => e.id === 'EV6001')
  if (!ev) return
  setMockNow(parseMockStamp(ev.startTime).getTime() + 15 * 60_000)
  clockText.value = formatMockStamp()
  flash('Mock 时间已进入 EV6001 签到窗口')
}

async function handleReview(item: MockReviewItem, verdict: MockReviewVerdict) {
  busy.value = item.id
  try {
    const message = reviewPending(item.domain, item.id, verdict, reviewReason.value)
    refreshReviewQueue()
    if (getMockNetworkMode() === 'normal' || getMockNetworkMode() === 'slow') {
      await auth.refreshProfile()
      await notices.refreshAll()
    }
    flash(message)
  } catch (error) {
    flash(error instanceof Error ? error.message : '审核模拟失败')
  } finally {
    busy.value = ''
  }
}

/* ---- 订单场景：把当前账号的一笔待发货订单推进为已发货（再回「我的订单」确认收货） ---- */async function advanceFirstOrder() {  const order = (ordersByUid[auth.uid] ?? []).find((o) => o.status === 'pending_shipment')
  if (!order) {
    flash('当前账号没有待发货订单（可先兑换下单）')
    return
  }
  busy.value = order.id
  try {
    await mockAdvanceOrder(order.id)
    flash(`订单「${order.goodsName}」已发货，可去我的订单确认收货`)
  } catch (error) {
    flash(error instanceof Error ? error.message : '订单状态推进失败')
  } finally {
    busy.value = ''
  }
}

/* ---- v40 活动场景：取消 / 改期并通知全部报名者（EV6005 演示活动） ---- */
async function onCancelEvent() {
  busy.value = 'event-cancel'
  try {
    flash(await cancelEventAsOps('EV6005', '场地冲突'))
  } catch (error) {
    flash(error instanceof Error ? error.message : '取消活动失败')
  } finally {
    busy.value = ''
  }
}

async function onPostponeEvent() {
  busy.value = 'event-postpone'
  try {
    flash(await postponeEventAsOps('EV6005', 1))
  } catch (error) {
    flash(error instanceof Error ? error.message : '活动改期失败')
  } finally {
    busy.value = ''
  }
}

function resetMock() {
  DialogPlugin.confirm({
    title: '重置 Mock 数据',
    content: '将清除 v33 业务快照与当前登录态，恢复初始演示数据。其他本地偏好不会被删除。',
    cancelBtn: '取消',
    confirmBtn: '确认重置',
    onConfirm: () => {
      resetMockState()
      flash('Mock 数据已重置，即将刷新')
      setTimeout(() => location.reload(), 500)
    },
  })
}
</script>

<template>
  <div class="devtools">
    <Button class="fab" shape="circle" title="Mock 开发者工具" @click="open = !open">🛠</Button>
    <div v-if="open" class="panel">
      <div class="panel-title">Mock 开发者工具<span class="mode">VITE_API_MODE=mock</span></div>

      <div class="section">演示账号（点击切换）</div>
      <Button
        v-for="a in accountItems"
        :key="a.phone"
        class="account"
        variant="outline"
        block
        size="small"
        :disabled="busy === a.phone || a.frozen"
        @click="switchAccount(a.phone)"
      >
        {{ a.label }}{{ a.frozen ? '（冻结）' : '' }}
      </Button>

      <div class="section">功能开关</div>
      <div v-for="key in switchKeys" :key="key" class="switch-row">
        <span>{{ key }}</span>
        <Switch :value="config.config[key]" @change="(v) => onToggle(key, v as boolean | number)" />
      </div>

      <div class="section">v33 · 网络场景</div>
      <div class="mode-grid">
        <Button
          v-for="item in networkModes"
          :key="item.value"
          size="small"
          :theme="networkMode === item.value ? 'primary' : 'default'"
          :variant="networkMode === item.value ? 'base' : 'outline'"
          @click="changeNetwork(item.value)"
        >
          {{ item.label }}
        </Button>
      </div>

      <div class="section">v33 · 业务时钟</div>
      <p class="clock">{{ clockText }}</p>
      <div class="clock-grid">
        <Button size="small" variant="outline" @click="moveClock(-1440)">-1 天</Button>
        <Button size="small" variant="outline" @click="moveClock(-15)">-15 分</Button>
        <Button size="small" variant="outline" @click="moveClock(15)">+15 分</Button>
        <Button size="small" variant="outline" @click="moveClock(1440)">+1 天</Button>
      </div>

      <div class="section">签到场景 · 位置注入</div>
      <div class="geo-grid">
        <Button size="small" variant="outline" @click="injectLocation('inside')">场地内</Button>
        <Button size="small" variant="outline" @click="injectLocation('outside')">场地外 500m</Button>
        <Button size="small" variant="outline" @click="injectLocation('denied')">关闭定位</Button>
        <Button size="small" variant="outline" @click="injectLocation('clear')">清除注入</Button>
      </div>
      <Button class="scenario" size="small" variant="outline" block @click="alignCheckinWindow">
        进入签到主场时间窗
      </Button>

      <div class="section">订单场景 · 模拟后台发货</div>
      <Button class="scenario" size="small" variant="outline" block @click="advanceFirstOrder">
        当前账号一笔待发货订单 → 已发货
      </Button>

      <div class="section">v40 · 活动场景（EV6005）</div>
      <Button class="scenario" size="small" variant="outline" block :disabled="busy === 'event-cancel'" @click="onCancelEvent">
        取消活动并通知报名者
      </Button>
      <Button class="scenario" size="small" variant="outline" block :disabled="busy === 'event-postpone'" @click="onPostponeEvent">
        活动改期 +1 天并通知
      </Button>

      <div class="section">v33 · 运营审核模拟（{{ reviewQueue.length }}）</div>      <Input v-model="reviewReason" class="review-reason" placeholder="驳回原因…" :maxlength="80" clearable />
      <div v-if="reviewQueue.length" class="review-list">
        <article v-for="item in reviewQueue" :key="`${item.domain}:${item.id}`" class="review-card">
          <div class="review-head">
            <strong>{{ item.domainLabel }} · {{ item.id }}</strong>
            <span>{{ item.ownerName }}</span>
          </div>
          <p>{{ item.title }}</p>
          <small>{{ item.detail }}</small>
          <div class="review-actions">
            <Button size="small" theme="primary" :disabled="busy === item.id" @click="handleReview(item, 'approved')">通过</Button>
            <Button size="small" theme="danger" variant="outline" :disabled="busy === item.id" @click="handleReview(item, 'rejected')">驳回</Button>
          </div>
        </article>
      </div>
      <p v-else class="empty-review">暂无待审核记录，可在客户端提交后回来操作</p>

      <div class="section">v37 · 漏斗计数（Mock 埋点）</div>
      <div v-for="item in funnel" :key="item.key" class="switch-row">
        <span>{{ item.key }}</span><span>{{ item.count }}</span>
      </div>

      <Button class="danger" theme="danger" variant="outline" block size="small" @click="resetMock">
        重置 v33 Mock 数据
      </Button>

      <p v-if="getPersistenceError()" class="persist-error">快照未保存：{{ getPersistenceError() }}</p>
      <p v-if="status" class="status" aria-live="polite">{{ status }}</p>
    </div>
  </div>
</template>

<style scoped>
.devtools {
  position: fixed;
  right: 14px;
  bottom: 90px;
  z-index: 9999;
}

.fab {
  --td-button-bg-color: var(--td-bg-color-container);

  width: 44px;
  height: 44px;
  font-size: var(--app-font-title);
  box-shadow: var(--td-shadow-3);
}

.panel {
  position: absolute;
  right: 0;
  bottom: 52px;
  width: 280px;
  max-width: calc(100vw - 28px);
  max-height: 70vh;
  overflow-y: auto;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  box-shadow: var(--td-shadow-3);
  padding:var(--app-space-7);
}

.panel-title {
  font-size: var(--app-font-body);
  font-weight: 600;
  margin-bottom:var(--app-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-4);
}

.mode {
  font-size: 10px;
  font-weight: 400;
  color: var(--td-text-color-placeholder);
}

.section {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
  margin:var(--app-space-5) 0 var(--app-space-3);
}

.account {
  margin-bottom:var(--app-space-3);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--app-font-caption);
  padding:var(--app-space-3) 0;
}

.geo-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap:var(--app-space-3);
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap:var(--app-space-2);
}

.clock {
  margin:0 0 var(--app-space-3);
  color: var(--td-text-color-primary);
  font-size: var(--app-font-caption);
  font-variant-numeric: tabular-nums;
}

.clock-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap:var(--app-space-2);
}

.review-reason {
  margin-bottom:var(--app-space-3);
}

.review-list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-3);
}

.review-card {
  padding:var(--app-space-4);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-secondarycontainer);
}

.review-head,
.review-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-3);
}

.review-head {
  font-size: var(--app-font-caption);
}

.review-head span,
.review-card small,
.empty-review {
  color: var(--td-text-color-secondary);
  font-size: var(--app-font-caption);
}

.review-card p {
  margin:var(--app-space-3) 0 var(--app-space-1);
  font-size: var(--app-font-caption);
}

.review-actions {
  justify-content: flex-end;
  margin-top:var(--app-space-4);
}

.empty-review {
  margin:var(--app-space-4) 0;
}

.scenario {
  margin-top:var(--app-space-3);
}

.danger {
  margin-top:var(--app-space-6);
}

.status {
  margin:var(--app-space-5) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-success-color);
}

.persist-error {
  margin:var(--app-space-5) 0 0;
  color: var(--td-error-color);
  font-size: var(--app-font-caption);
}
</style>
