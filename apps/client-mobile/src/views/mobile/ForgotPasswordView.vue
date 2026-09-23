<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Form, FormItem, Input, Radio, RadioGroup, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { fetchRecoveryChannels, resetPassword, sendResetCode } from '@/api/auth'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { isPasswordStrong, isSmsCode, PASSWORD_MSG, REQUIRED } from '@/utils/validators'
import type { RecoveryChannels } from '@/types'

/* 找回密码：两步——① 校验账号并取回已验证可信渠道（脱敏）；② 选渠道收码并重置新密码。
 * v46：两步表单均迁移 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const router = useRouter()
const auth = useAuthStore()

const step = ref<1 | 2>(1)
const channels = ref<RecoveryChannels | null>(null)
const channel = ref<'email' | 'phone'>('email')
const form = reactive({ identifier: '', code: '', password: '', confirm: '' })
const checking = ref(false)
const sending = ref(false)
const submitting = ref(false)
const countdown = ref(0)
const step2FormRef = ref<FormInstanceFunctions>()

/* 改密表单离开保护：任一步有非空输入即视为未保存；重置成功后先 markClean 再跳转，避免误拦 */
const hasUnsavedInput = computed(() => Boolean(
  form.identifier.trim() || form.code.trim() || form.password || form.confirm,
))
const { markClean } = useUnsavedGuard(() => hasUnsavedInput.value)

const identifierRules: FormRules<typeof form> = {
  identifier: [{ required: true, message: REQUIRED('手机号/邮箱/用户名') }],
}

const resetRules: FormRules<typeof form> = {
  code: [
    { required: true, message: REQUIRED('6 位验证码') },
    { validator: (val: string) => !val.trim() || isSmsCode(val), message: REQUIRED('6 位验证码') },
  ],
  password: [
    { required: true, message: PASSWORD_MSG },
    { validator: (val: string) => !val.trim() || isPasswordStrong(val), message: PASSWORD_MSG },
  ],
  confirm: [{ validator: (val: string) => val === form.password, message: '两次输入的密码不一致' }],
}

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
  checking.value = true
  try {
    const result = await fetchRecoveryChannels(form.identifier.trim())
    channels.value = result
    if (!result.email && !result.phone) {
      Toast('该账号未绑定已验证的邮箱或手机号，请联系客服')
      return
    }
    channel.value = result.email ? 'email' : 'phone'
    step.value = 2
  } catch (e) {
    /* 反枚举：账号校验类失败（服务端业务码）统一话术，不区分「未注册/未绑定」；
     * 但网络/超时类错误（code 0/408）必须明确提示重试，否则用户看到「假成功」话术却毫无进展 */
    const code = e instanceof ApiError ? e.code : -1
    if (code === 0 || code === 408 || code === -1) {
      Toast(e instanceof ApiError && e.code === 408 ? '请求超时，请重试' : '网络异常，请稍后重试')
    } else {
      /* 统一话术：不区分「账号未注册/未绑定」，避免账号枚举 */
      Toast('若账号存在，将通过可信渠道发送验证码')
    }
  } finally {
    checking.value = false
  }
}

function onNextSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) void onNext()
}

async function onSendCode() {
  form.code = ''
  /* 清空验证码输入后不残留字段级错误提示 */
  void nextTick(() => step2FormRef.value?.clearValidate(['code']))
  sending.value = true
  try {
    /* 由服务端按账号解析可信渠道并投递，客户端不接触真实收件地址 */
    const result = await sendResetCode({ identifier: form.identifier.trim(), channel: channel.value })
    Toast(result.devCode ? `验证码已发送（演示码 ${result.devCode}）` : '验证码已发送')
    startCountdown()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '验证码发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

async function onSubmit() {
  submitting.value = true
  try {
    await resetPassword({
      identifier: form.identifier.trim(),
      channel: channel.value,
      code: form.code.trim(),
      newPassword: form.password,
    })
    Toast('密码已重置')
    /* 重置成功后服务端强制全端登出：清理本地会话并回到登录页 */
    auth.resetSession()
    markClean()
    await router.replace('/login')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '重置失败，请稍后重试')
    form.code = ''
    /* API 失败清空验证码输入后不残留字段级错误提示 */
    void nextTick(() => step2FormRef.value?.clearValidate(['code']))
  } finally {
    submitting.value = false
  }
}

function onResetSubmit({ validateResult }: { validateResult: unknown }) {
  if (validateResult === true) void onSubmit()
}

function backToStep1() {
  step.value = 1
  channels.value = null
  form.code = ''
  form.password = ''
  form.confirm = ''
  stopCountdown()
}
</script>

<template>
  <main id="main" class="page-fade-in m-forgot" tabindex="-1">
    <header class="hero">
      <h1 class="title">找回密码</h1>
      <p class="subtitle">{{ step === 1 ? '验证账号后通过可信渠道重置密码' : '选择验证方式并设置新密码' }}</p>
    </header>

    <Form
      v-if="step === 1"
      class="form"
      :data="form"
      :rules="identifierRules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onNextSubmit"
    >
      <FormItem label="手机号/邮箱/用户名" name="identifier">
        <Input v-model="form.identifier" type="text" autocomplete="username" placeholder="请输入手机号/邮箱/用户名…" clearable />
      </FormItem>
      <Button theme="primary" size="large" block type="submit" :loading="checking">下一步</Button>
      <p class="swap">想起密码了？<router-link to="/login" class="link">返回登录</router-link></p>
    </Form>

    <Form
      v-else
      ref="step2FormRef"
      class="form"
      :data="form"
      :rules="resetRules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onResetSubmit"
    >
      <FormItem label="账号">
        <Input :model-value="form.identifier" disabled />
      </FormItem>
      <div class="field">
        <span class="field-label">验证方式</span>
        <RadioGroup v-model="channel" class="channels">
          <Radio v-for="item in availableChannels" :key="item.value" :value="item.value" :label="`${item.label}（${item.note}）`" />
        </RadioGroup>
      </div>
      <FormItem label="验证码" name="code">
        <div class="code-row">
          <Input v-model="form.code" class="code-input" :maxlength="6" inputmode="numeric" :spell-check="false" placeholder="请输入 6 位验证码…" clearable />
          <Button class="code-button" theme="light" :disabled="sending || countdown > 0" @click="onSendCode">
            {{ countdown > 0 ? `${countdown}s` : sending ? '发送中…' : '获取验证码' }}
          </Button>
        </div>
      </FormItem>
      <FormItem label="新密码" name="password">
        <Input class="password-field" v-model="form.password" type="password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字…" clearable />
      </FormItem>
      <FormItem label="确认新密码" name="confirm">
        <Input class="password-field" v-model="form.confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码…" clearable />
      </FormItem>

      <Button theme="primary" size="large" block type="submit" :loading="submitting">重置密码</Button>
      <p class="swap"><a v-pressable class="link" @click="backToStep1">返回上一步</a></p>
    </Form>
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
  padding:calc(var(--app-space-12) + var(--app-space-8)) 0 var(--app-space-11);
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

/* t-form-item 默认左右布局 + 底部 hairline；本页沿用「标签在上」的既有版式 */
.form :deep(.t-form__item) {
  padding: 0;
  margin: 0 0 var(--app-space-8);
  border-bottom: none;
}

.form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.form :deep(.t-form__controls) {
  margin: 0;
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
  /* v48：与注册页同因——flex item 默认收缩为内容宽，导致验证码按钮不右对齐；撑满可用宽度 */
  width: 100%;
  min-width: 0;
}

.code-input {
  flex: 1;
  min-width: 0;
}

.code-button {
  flex-shrink: 0;
  min-width: 108px;
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

/* 密码显隐图标：内部类名 t-input__wrap--suffix-icon（官方无命中区/尺寸类 API，点击处理器挂在图标 SVG 上）。
 * 视觉保持 24px，用 padding 把 SVG 命中区抬到 44px 触控基线；升级 TDesign 时需复核类名与 DOM 结构。 */
.password-field :deep(.t-input__wrap--suffix-icon) {
  display: grid;
  flex: 0 0 44px;
  width: 44px;
  place-items: center;
}

.password-field :deep(.t-input__wrap--suffix-icon svg) {
  width: 24px;
  height: 24px;
  padding: 10px;
  box-sizing: content-box;
}

.password-field :deep(.t-input--password) {
  letter-spacing: 0;
}
</style>
