<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { accounts } from '@/mock/db'

/* [MOCK-ONLY] 开发者工具（仅 mock 模式挂载，接入期随 mock 目录退役）：
 * 1. 演示账号一键切换  2. 功能开关实时覆写  3. 重置 Mock 数据
 *
 * ⚠️ 本组件在 App.vue 中全局挂载，因此**刻意不引入任何组件库**：
 * 一旦 import tdesign-mobile-vue，桶导入会把移动端整包 CSS 带进桌面端的全局样式图。
 * 由于移动端与桌面端共用 `--td-*` 令牌与 `.t-*` 类名，移动端规则会误命中桌面组件
 * ——典型表现：移动端 `.t-button::after{border-style:solid}` 命中桌面 `.t-button`
 * （而补齐 width/color 的 `.t-button--default::after` 不匹配桌面的 `--theme-*` 类），
 * 使桌面按钮出现约 3px 的黑色描边。详见 docs/wiki-client-mobile.md §3 / §5.3。 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()

const open = ref(false)
const busy = ref('')
const status = ref('')
const switchKeys = ['registrationOpen', 'mallOpen', 'demandOpen', 'reservationOpen'] as const

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

function onToggle(key: (typeof switchKeys)[number], value: boolean) {
  config.override({ [key]: value })
}

async function resetMock() {
  localStorage.clear()
  flash('Mock 数据已重置，即将刷新')
  setTimeout(() => location.reload(), 500)
}
</script>

<template>
  <div class="devtools">
    <button class="fab" :class="{ open }" type="button" title="Mock 开发者工具" @click="open = !open">🛠</button>
    <div v-if="open" class="panel">
      <div class="panel-title">Mock 开发者工具<span class="mode">VITE_API_MODE=mock</span></div>

      <div class="section">演示账号（点击切换）</div>
      <button
        v-for="a in accounts"
        :key="a.uid"
        class="account"
        type="button"
        :disabled="busy === a.phone"
        @click="switchAccount(a.phone)"
      >
        <span class="acc-name">{{ a.nickname }}</span>
        <span class="acc-phone">{{ a.phone }}</span>
        <span class="acc-idps">{{ a.identities.map((i) => i.type).join(' / ') }}</span>
        <span v-if="a.status === 'frozen'" class="acc-frozen">冻结</span>
      </button>

      <div class="section">功能开关</div>
      <div v-for="key in switchKeys" :key="key" class="switch-row">
        <span>{{ key }}</span>
        <button
          class="switch"
          :class="{ on: config.config[key] }"
          type="button"
          role="switch"
          :aria-checked="config.config[key]"
          @click="onToggle(key, !config.config[key])"
        >
          <span class="knob" />
        </button>
      </div>

      <button class="danger" type="button" @click="resetMock">重置 Mock 数据（清 localStorage）</button>

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
  width: 44px;
  height: 44px;
  border: 1px solid var(--td-component-border);
  border-radius: 50%;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-3);
  font-size: 18px;
  cursor: pointer;
}

.fab.open {
  background: var(--td-brand-color-1);
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
  font-size: 11px;
  color: var(--td-text-color-secondary);
  margin: 10px 0 6px;
}

.account {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  background: none;
  color: var(--td-text-color-primary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.account:hover {
  border-color: var(--td-brand-color);
}

.account:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.acc-name {
  font-weight: 600;
}

.acc-phone {
  color: var(--td-text-color-secondary);
}

.acc-idps {
  margin-left: auto;
  font-size: 10px;
  color: var(--td-text-color-placeholder);
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acc-frozen {
  color: var(--td-error-color);
  font-size: 10px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 6px 0;
}

.switch {
  position: relative;
  width: 34px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: var(--td-bg-color-component);
  cursor: pointer;
  transition: background 160ms ease;
}

.switch.on {
  background: var(--td-brand-color);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--td-bg-color-container);
  transition: transform 160ms ease;
}

.switch.on .knob {
  transform: translateX(14px);
}

.danger {
  width: 100%;
  margin-top: 12px;
  padding: 8px;
  border: 1px solid var(--td-error-color);
  border-radius: var(--td-radius-default);
  background: none;
  color: var(--td-error-color);
  font-size: 12px;
  cursor: pointer;
}

.status {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--td-success-color);
}
</style>
