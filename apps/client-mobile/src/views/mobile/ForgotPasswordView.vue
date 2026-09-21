<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Radio, RadioGroup, Toast } from 'tdesign-mobile-vue'
import { fetchRecoveryChannels, resetPassword, sendResetCode } from '@/api/auth'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { isPasswordStrong, isSmsCode, PASSWORD_MSG, REQUIRED } from '@/utils/validators'
import type { RecoveryChannels } from '@/types'

/* 找回密码：两步——① 校验账号并取回已验证可信渠道（脱敏）；② 选渠道收码并重置新密码。 */
const router = useRouter()
const auth = useAuthStore()

const step = ref<1 | 2>(1)
const identifier = ref('')
const channels = ref<RecoveryChannels | null>(null)
const channel = ref<'email' | 'phone'>('email')
const code = ref('')
const password = ref('')
const confirm = ref('')
const checking = ref(false)
const sending = ref(false)
const submitting = ref(false)
const countdown = ref(0)
const errors = reactive({ identifier: '', code: '', password: '', confirm: '' })

const availableChannels = computed(() => {
  const list: { value: 'email' | 'phone'; label: string; note: string }[] = []
  if (channels.value?.email) list.push({ value: 'email', label: '邮箱验证', note: channels.value.email })
  if (channels.value?.phone) list.push({ value: 'phone', label: '短信验证', note: channels.value.phone })
  return list
})

let timer: number | undefined
function stopCountdown() {
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
  countdown.value = 0
}
function startCountdown(seconds = 60) {
  stopCountdown()
  countdown.value = seconds
  timer = window.setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) stopCountdown()
  }, 1000)
}
onBeforeUnmount(stopCountdown)

async function onNext() {
  errors.identifier = identifier.value.trim() ? '' : REQUIRED('手机号/邮箱/用户名')
  if (errors.identifier) return void Toast(errors.identifier)
  checking.value = true
  try {
    const result = await fetchRecoveryChannels(identifier.value.trim())
    channels.value = result
    if (!result.email && !result.phone) {
      Toast('该账号未绑定已验证的邮箱或手机号，请联系客服')
      return
    }
    channel.value = result.email ? 'email' : 'phone'
    step.value = 2
  } catch {
    /* 统一话术：不区分「账号未注册/未绑定」，避免账号枚举 */
    Toast('若账号存在，将通过可信渠道发送验证码')
  } finally {
    checking.value = false
  }
}

async function onSendCode() {
  code.value = ''
  errors.code = ''
  sending.value = true
  try {
    /* 由服务端按账号解析可信渠道并投递，客户端不接触真实收件地址 */
    const result = await sendResetCode({ identifier: identifier.value.trim(), channel: channel.value })
    Toast(result.devCode ? `验证码已发送（演示码 ${result.devCode}）` : '验证码已发送')
    startCountdown()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '验证码发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

async function onSubmit() {
  errors.code = isSmsCode(code.value) ? '' : REQUIRED('6 位验证码')
  errors.password = isPasswordStrong(password.value) ? '' : PASSWORD_MSG
  errors.confirm = password.value === confirm.value ? '' : '两次输入的密码不一致'
  const firstError = Object.values(errors).find(Boolean)
  if (firstError) return void Toast(firstError)
  submitting.value = true
  try {
    await resetPassword({
      identifier: identifier.value.trim(),
      channel: channel.value,
      code: code.value.trim(),
      newPassword: password.value,
    })
    Toast('密码已重置')
    /* 重置成功后服务端强制全端登出：清理本地会话并回到登录页 */
    auth.resetSession()
    await router.replace('/login')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '重置失败，请稍后重试')
    code.value = ''
  } finally {
    submitting.value = false
  }
}

function backToStep1() {
  step.value = 1
  channels.value = null
  code.value = ''
  password.value = ''
  confirm.value = ''
  Object.keys(errors).forEach((key) => { (errors as Record<string, string>)[key] = '' })
  stopCountdown()
}
</script>

<template>
  <main id="main" class="page-fade-in m-forgot" tabindex="-1">
    <header class="hero">
      <h1 class="title">找回密码</h1>
      <p class="subtitle">{{ step === 1 ? '验证账号后通过可信渠道重置密码' : '选择验证方式并设置新密码' }}</p>
    </header>

    <form v-if="step === 1" class="form" @submit.prevent="onNext">
      <div class="field">
        <label>手机号/邮箱/用户名</label>
        <Input v-model="identifier" type="text" autocomplete="username" placeholder="请输入手机号/邮箱/用户名…" clearable @keyup.enter="onNext" />
        <p v-if="errors.identifier" class="error">{{ errors.identifier }}</p>
      </div>
      <Button theme="primary" size="large" block :loading="checking" @click="onNext">下一步</Button>
      <p class="swap">想起密码了？<router-link to="/login" class="link">返回登录</router-link></p>
    </form>

    <form v-else class="form" @submit.prevent="onSubmit">
      <div class="field">
        <label>账号</label>
        <Input :model-value="identifier" disabled />
      </div>
      <div class="field">
        <span class="field-label">验证方式</span>
        <RadioGroup v-model="channel" class="channels">
          <Radio v-for="item in availableChannels" :key="item.value" :value="item.value" :label="`${item.label}（${item.note}）`" />
        </RadioGroup>
      </div>
      <div class="field">
        <label>验证码</label>
        <div class="code-row">
          <Input v-model="code" class="code-input" :maxlength="6" inputmode="numeric" :spell-check="false" placeholder="请输入 6 位验证码…" clearable />
          <Button class="code-button" theme="light" :disabled="sending || countdown > 0" @click="onSendCode">
            {{ countdown > 0 ? `${countdown}s` : sending ? '发送中…' : '获取验证码' }}
          </Button>
        </div>
        <p v-if="errors.code" class="error">{{ errors.code }}</p>
      </div>
      <div class="field">
        <label>新密码</label>
        <Input class="password-field" v-model="password" type="password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字…" clearable />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
      </div>
      <div class="field">
        <label>确认新密码</label>
        <Input class="password-field" v-model="confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码…" clearable />
        <p v-if="errors.confirm" class="error">{{ errors.confirm }}</p>
      </div>

      <Button theme="primary" size="large" block :loading="submitting" @click="onSubmit">重置密码</Button>
      <p class="swap"><a class="link" @click="backToStep1">返回上一步</a></p>
    </form>
  </main>
</template>

<style scoped>
.m-forgot {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 var(--app-space-11) calc(var(--app-space-11) + env(safe-area-inset-bottom));
}

.hero {
  padding:48px 0 var(--app-space-11);
}

.title {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-title);
}

.subtitle {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom:var(--app-space-8);
}

.field label,
.field .field-label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.channels {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.code-row {
  display: flex;
  align-items: center;
  gap:var(--app-space-5);
}

.code-input {
  flex: 1;
  min-width: 0;
}

.code-button {
  flex-shrink: 0;
  min-width: 108px;
  min-height: 40px;
}

.error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.swap {
  margin:var(--app-space-7) 0 0;
  text-align: center;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
  cursor: pointer;
}

.password-field :deep(.t-input__wrap--suffix-icon) {
  display: grid;
  flex: 0 0 24px;
  width: 24px;
  place-items: center;
}

.password-field :deep(.t-input--password) {
  letter-spacing: 0;
}
</style>
