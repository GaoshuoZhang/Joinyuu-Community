<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Switch } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { mockAdvanceOrder } from '@/api/mall'
import { accounts, appConfig, events, ordersByUid } from '@/mock/db'

/* [MOCK-ONLY] 开发者工具（仅 mock 模式挂载，接入期随 mock 目录退役）：
 * 1. 演示账号一键切换  2. 功能开关实时覆写  3. 签到场景（位置注入 + 时间窗对齐）
 * 4. 订单场景（模拟后台发货）  5. 重置 Mock 数据 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()

const open = ref(false)
const busy = ref('')
const status = ref('')
const switchKeys = ['registrationOpen', 'mallOpen', 'demandOpen', 'reservationOpen'] as const

const accountItems = computed(() => accounts.map((a) => ({ phone: a.phone, label: `${a.nickname} · ${a.phone}`, frozen: a.status === 'frozen' })))

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
  } finally {
    busy.value = ''
  }
}

function onToggle(key: (typeof switchKeys)[number], value: boolean | number) {
  const next = Boolean(value)
  config.override({ [key]: next })
  /* [MOCK-ONLY] 同步 mock 业务门禁：保证「入口隐藏」与「写端点 400 文案」行为一致 */
  appConfig[key] = next
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

/* ---- 签到场景：把签到主场 EV6001 的时间窗对齐当前时刻，任意时间可演示签到成功 ---- */
function alignCheckinWindow() {
  const ev = events.find((e) => e.id === 'EV6001')
  if (!ev) return
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock(d)}`
  const now = Date.now()
  ev.startTime = stamp(new Date(now - 30 * 60_000))
  ev.endTime = stamp(new Date(now + 90 * 60_000))
  ev.enrollmentDeadline = stamp(new Date(now + 60 * 60_000))
  ev.checkinOpenMin = clock(new Date(now - 45 * 60_000))
  ev.checkinCloseMin = clock(new Date(now + 90 * 60_000))
  flash('EV6001 签到时间窗已对齐当前（进行中）')
}

/* ---- 订单场景：把当前账号的一笔待发货订单推进为已发货（再回「我的订单」确认收货） ---- */
async function advanceFirstOrder() {
  const order = (ordersByUid[auth.uid] ?? []).find((o) => o.status === 'pending_shipment')
  if (!order) {
    flash('当前账号没有待发货订单（可先兑换下单）')
    return
  }
  busy.value = order.id
  try {
    await mockAdvanceOrder(order.id)
    flash(`订单「${order.goodsName}」已发货，可去我的订单确认收货`)
  } finally {
    busy.value = ''
  }
}

async function resetMock() {
  localStorage.clear()
  flash('Mock 数据已重置，即将刷新')
  setTimeout(() => location.reload(), 500)
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

      <div class="section">签到场景 · 位置注入</div>
      <div class="geo-grid">
        <Button size="small" variant="outline" @click="injectLocation('inside')">场地内</Button>
        <Button size="small" variant="outline" @click="injectLocation('outside')">场地外 500m</Button>
        <Button size="small" variant="outline" @click="injectLocation('denied')">关闭定位</Button>
        <Button size="small" variant="outline" @click="injectLocation('clear')">清除注入</Button>
      </div>
      <Button class="scenario" size="small" variant="outline" block @click="alignCheckinWindow">
        签到活动时间窗对齐当前
      </Button>

      <div class="section">订单场景 · 模拟后台发货</div>
      <Button class="scenario" size="small" variant="outline" block @click="advanceFirstOrder">
        当前账号一笔待发货订单 → 已发货
      </Button>

      <Button class="danger" theme="danger" variant="outline" block size="small" @click="resetMock">
        重置 Mock 数据（清 localStorage）
      </Button>

      <p v-if="status" class="status">{{ status }}</p>
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
  font-size: 18px;
  box-shadow: var(--td-shadow-3);
}

.panel {
  position: absolute;
  right: 0;
  bottom: 52px;
  width: 280px;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-3);
  padding: 14px;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mode {
  font-size: 10px;
  font-weight: 400;
  color: var(--td-text-color-placeholder);
}

.section {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin: 10px 0 6px;
}

.account {
  margin-bottom: 6px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 0;
}

.geo-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.scenario {
  margin-top: 6px;
}

.danger {
  margin-top: 12px;
}

.status {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-success-color);
}
</style>
