<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Checkbox, Input, NoticeBar, Radio, RadioGroup, Toast } from 'tdesign-mobile-vue'
import { fetchEmailAvailable, fetchSmsAvailable, sendEmailCode, sendSmsCode } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { ApiError } from '@/api/http'
import { CODE_MSG, EMAIL_MSG, isEmail, isPasswordStrong, isPhone, isSmsCode, PASSWORD_MSG, PHONE_MSG, REQUIRED } from '@/utils/validators'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动注册：邮箱/手机号双渠道（通道可用性由服务端下发）+ 验证码；注册成功即登录。
 * 昵称与用户名由服务端自动分配，注册后可在「我的资料」修改。 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()
void config.ensureLoaded()

const channel = ref<'email' | 'phone'>('email')
const emailAvailable = ref(true)
const smsAvailable = ref(false)
const form = reactive({ email: '', phone: '', code: '', password: '', confirmPassword: '' })
const submitting = ref(false)
const sending = ref(false)
const countdown = ref(0)
const errors = reactive<Record<string, string>>({})
const closed = computed(() => !config.config.registrationOpen)
/* v38：注册须勾选同意协议（Mock 记录同意时间；真实后端需版本化留痕） */
const agreed = ref(false)

/* 通道可用性：短信默认隐藏，仅确认可用时展示；邮箱不可用且短信可用时默认手机号。
 * 探测失败一律按「不可用」处理（不默认放开），并提示用户，避免误放行不可用通道 */
onMounted(async () => {
  const [emailResult, smsResult] = await Promise.allSettled([fetchEmailAvailable(), fetchSmsAvailable()])
  const email = emailResult.status === 'fulfilled' ? emailResult.value : false
  const sms = smsResult.status === 'fulfilled' ? smsResult.value : false
  emailAvailable.value = email
  smsAvailable.value = sms
  if (!email && sms) channel.value = 'phone'
  if (emailResult.status === 'rejected' || smsResult.status === 'rejected') {
    Toast('通道可用性检测失败，部分注册方式可能暂时不可用')
  }
})

const currentChannelAvailable = computed(() => (channel.value === 'email' ? emailAvailable.value : smsAvailable.value))

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

async function onSendCode() {
  errors.email = ''
  errors.phone = ''
  errors.code = ''
  if (channel.value === 'email') {
    if (!isEmail(form.email)) {
      errors.email = form.email.trim() ? EMAIL_MSG : REQUIRED('邮箱')
      return void Toast(errors.email)
    }
  } else if (!isPhone(form.phone)) {
    errors.phone = form.phone.trim() ? PHONE_MSG : REQUIRED('手机号')
    return void Toast(errors.phone)
  }
  sending.value = true
  try {
    const result = channel.value === 'email'
      ? await sendEmailCode({ email: form.email.trim(), purpose: 'register' })
      : await sendSmsCode({ phone: form.phone.trim(), purpose: 'register' })
    Toast(result.devCode ? `验证码已发送（演示码 ${result.devCode}）` : '验证码已发送')
    startCountdown()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '验证码发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

function validate(): boolean {
  Object.keys(errors).forEach((key) => { errors[key] = '' })
  if (channel.value === 'email') {
    if (!form.email.trim()) errors.email = REQUIRED('邮箱')
    else if (!isEmail(form.email)) errors.email = EMAIL_MSG
  } else if (!form.phone.trim()) errors.phone = REQUIRED('手机号')
  else if (!isPhone(form.phone)) errors.phone = PHONE_MSG
  errors.code = isSmsCode(form.code) ? '' : CODE_MSG
  errors.password = isPasswordStrong(form.password) ? '' : PASSWORD_MSG
  errors.confirmPassword = form.confirmPassword === form.password ? '' : '两次输入的密码不一致'
  errors.agreed = agreed.value ? '' : '请阅读并同意《用户协议》与《隐私政策》'
  const first = Object.values(errors).find((v) => v)
  if (first) Toast(first)
  return !first
}

async function onSubmit() {
  if (closed.value || !validate()) return
  submitting.value = true
  try {
    await auth.register({
      channel: channel.value,
      email: channel.value === 'email' ? form.email.trim() : undefined,
      phone: channel.value === 'phone' ? form.phone.trim() : undefined,
      code: form.code.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      agreed: agreed.value,
    })
    notices.refreshUnread()
    Toast('注册成功，欢迎加入聚屿社区')
    await router.push('/')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '注册失败，请稍后重试')
    form.code = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main id="main" class="page-fade-in m-register" tabindex="-1">
    <div class="hero">
      <h1 class="title">创建账号</h1>
      <p class="sub">注册默认获得「个人用户」身份，昵称与用户名由系统自动分配</p>
    </div>

    <NoticeBar v-if="closed" visible theme="warning" content="注册暂未开放，请稍后再试。" class="closed-tip" />
    <NoticeBar v-else-if="!currentChannelAvailable" visible theme="warning" content="所选注册方式暂未开放，请切换其他方式。" class="closed-tip" />

    <form class="form" @submit.prevent="onSubmit">
      <div class="field">
        <span class="field-label">注册方式</span>
        <RadioGroup v-model="channel" class="channels">
          <Radio value="email" label="邮箱注册" :disabled="closed || !emailAvailable" />
          <Radio v-if="smsAvailable" value="phone" label="手机号注册" :disabled="closed" />
        </RadioGroup>
      </div>
      <div v-if="channel === 'email'" class="field">
        <label>邮箱</label>
        <Input v-model="form.email" type="text" autocomplete="email" placeholder="请输入邮箱…" :disabled="closed" @keyup.enter="onSubmit" />
        <p v-if="errors.email" class="error">{{ errors.email }}</p>
      </div>
      <div v-else class="field">
        <label>手机号</label>
        <Input
          v-model="form.phone"
          type="tel"
          autocomplete="tel"
          :maxlength="11"
          placeholder="请输入手机号…"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.phone" class="error">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label>验证码</label>
        <div class="code-row">
          <Input
            v-model="form.code"
            class="code-input"
            :maxlength="6"
            inputmode="numeric"
            :spell-check="false"
            placeholder="请输入 6 位验证码…"
            :disabled="closed"
            @keyup.enter="onSubmit"
          />
          <Button
            class="code-button"
            theme="light"
            :disabled="closed || sending || countdown > 0 || !currentChannelAvailable"
            @click="onSendCode"
          >
            {{ countdown > 0 ? `${countdown}s` : sending ? '发送中…' : '获取验证码' }}
          </Button>
        </div>
        <p v-if="errors.code" class="error">{{ errors.code }}</p>
      </div>
      <div class="field">
        <label>密码</label>
        <Input
          class="password-field"
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          placeholder="密码（至少 8 位，含字母与数字）…"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
      </div>
      <div class="field">
        <label>确认密码</label>
        <Input
          class="password-field"
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="请再次输入密码…"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.confirmPassword" class="error">{{ errors.confirmPassword }}</p>
      </div>
      <div class="agreement">
        <Checkbox :checked="agreed" :borderless="true" @change="(value: unknown) => (agreed = Boolean(value))">
          <template #label>
            我已阅读并同意
            <router-link to="/privacy" class="link" @click.stop>《用户协议》与《隐私政策》</router-link>
          </template>
        </Checkbox>
      </div>
      <p v-if="errors.agreed" class="error agreement-error">{{ errors.agreed }}</p>
      <Button theme="primary" size="large" block :loading="submitting" :disabled="submitting || closed" @click="onSubmit">
        {{ closed ? '注册暂未开放' : submitting ? '注册中…' : '注 册' }}
      </Button>
      <p class="swap">已有账号？<router-link to="/login" class="link">直接登录</router-link></p>
    </form>
  </main>
</template>

<style scoped>
.m-register {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 var(--app-space-11) calc(var(--app-space-11) + env(safe-area-inset-bottom));
}

.hero {
  padding:40px 0 var(--app-space-11);
}

.title {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-title);
}

.sub {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.closed-tip {
  margin-bottom:var(--app-space-7);
}

.field {
  margin-bottom:var(--app-space-7);
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
  gap:var(--app-space-10);
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

.agreement {
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-3);
  margin:var(--app-space-2) 0 var(--app-space-7);
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.agreement .link {
  color: var(--td-brand-color);
}

.agreement-error {
  margin:-8px 0 var(--app-space-6);
}

.error {
  margin:var(--app-space-2) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.swap {
  margin:var(--app-space-9) 0 0;
  text-align: center;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
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
