<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Switch } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { accounts } from '@/mock/db'

/* [MOCK-ONLY] 开发者工具（仅 mock 模式挂载，接入期随 mock 目录退役）：
 * 1. 演示账号一键切换  2. 功能开关实时覆写  3. 重置 Mock 数据 */
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
  config.override({ [key]: Boolean(value) })
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

.danger {
  margin-top: 12px;
}

.status {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-success-color);
}
</style>
