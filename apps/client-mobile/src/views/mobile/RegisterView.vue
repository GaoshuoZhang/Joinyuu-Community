<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Checkbox, Form, FormItem, Input, NoticeBar, Radio, RadioGroup, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { fetchEmailAvailable, fetchSmsAvailable, sendEmailCode, sendSmsCode } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { ApiError } from '@/api/http'
import { CODE_MSG, EMAIL_MSG, isEmail, isPasswordStrong, isPhone, isSmsCode, PASSWORD_MSG, PHONE_MSG, REQUIRED } from '@/utils/validators'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动注册：邮箱/手机号双渠道（通道可用性由服务端下发）+ 验证码；注册成功即登录。
 * 昵称与用户名由服务端自动分配，注册后可在「我的资料」修改。
 * v46：校验迁移到 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()
void config.ensureLoaded()

const channel = ref<'email' | 'phone'>('email')
const emailAvailable = ref(true)
const smsAvailable = ref(false)
const form = reactive({ email: '', phone: '', code: '', password: '', confirmPassword: '', agreed: false })
const submitting = ref(false)
const sending = ref(false)
const countdown = ref(0)
const formRef = ref<FormInstanceFunctions>()
const closed = computed(() => !config.config.registrationOpen)

/* 长表单离开保护：任一字段有内容即视为未保存；注册成功后先 markClean 再跳转，避免误拦 */
const hasUnsavedInput = computed(() => Boolean(
  form.email.trim() || form.phone.trim() || form.code.trim() || form.password || form.confirmPassword,
))
const { markClean } = useUnsavedGuard(() => hasUnsavedInput.value)

const rules: FormRules<typeof form> = {
  email: [
    { required: true, message: REQUIRED('邮箱') },
    { validator: (val: string) => !val.trim() || isEmail(val), message: EMAIL_MSG },
  ],
  phone: [
    { required: true, message: REQUIRED('手机号') },
    { validator: (val: string) => !val.trim() || isPhone(val), message: PHONE_MSG },
  ],
  code: [
    { required: true, message: CODE_MSG },
    { validator: (val: string) => !val.trim() || isSmsCode(val), message: CODE_MSG },
  ],
  password: [
    { required: true, message: PASSWORD_MSG },
    { validator: (val: string) => !val.trim() || isPasswordStrong(val), message: PASSWORD_MSG },
  ],
  confirmPassword: [{ validator: (val: string) => val === form.password, message: '两次输入的密码不一致' }],
  agreed: [{ validator: (val: unknown) => Boolean(val), message: '请阅读并同意《用户协议》与《隐私政策》' }],
}

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
  /* 发送验证码是独立动作：只校验当前通道字段，错误内联展示在字段下方 */
  const valid = await formRef.value?.validate({ fields: [channel.value === 'email' ? 'email' : 'phone'] })
  if (valid !== true) return
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

async function onSubmit() {
  if (closed.value) return
  submitting.value = true
  try {
    await auth.register({
      channel: channel.value,
      email: channel.value === 'email' ? form.email.trim() : undefined,
      phone: channel.value === 'phone' ? form.phone.trim() : undefined,
      code: form.code.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      agreed: form.agreed,
    })
    notices.refreshUnread()
    Toast('注册成功，欢迎加入聚屿社区')
    markClean()
    await router.push('/')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '注册失败，请稍后重试')
    form.code = ''
    /* API 失败清空验证码输入后不残留字段级错误提示 */
    void nextTick(() => formRef.value?.clearValidate(['code']))
  } finally {
    submitting.value = false
  }
}

function onRegisterSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) void onSubmit()
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

    <Form
      ref="formRef"
      class="form"
      :data="form"
      :rules="rules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onRegisterSubmit"
    >
      <div class="field">
        <span class="field-label">注册方式</span>
        <RadioGroup v-model="channel" class="channels">
          <Radio value="email" label="邮箱注册" :disabled="closed || !emailAvailable" />
          <Radio v-if="smsAvailable" value="phone" label="手机号注册" :disabled="closed" />
        </RadioGroup>
      </div>
      <FormItem v-if="channel === 'email'" label="邮箱" name="email">
        <Input v-model="form.email" type="text" inputmode="email" autocomplete="email" placeholder="请输入邮箱…" :disabled="closed" />
      </FormItem>
      <FormItem v-else label="手机号" name="phone">
        <Input
          v-model="form.phone"
          type="tel"
          autocomplete="tel"
          :maxlength="11"
          placeholder="请输入手机号…"
          :disabled="closed"
        />
      </FormItem>
      <FormItem label="验证码" name="code">
        <div class="code-row">
          <Input
            v-model="form.code"
            class="code-input"
            :maxlength="6"
            inputmode="numeric"
            :spell-check="false"
            placeholder="请输入 6 位验证码…"
            :disabled="closed"
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
      </FormItem>
      <FormItem label="密码" name="password">
        <Input
          class="password-field"
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          placeholder="密码（至少 8 位，含字母与数字）…"
          :disabled="closed"
        />
      </FormItem>
      <FormItem label="确认密码" name="confirmPassword">
        <Input
          class="password-field"
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="请再次输入密码…"
          :disabled="closed"
        />
      </FormItem>
      <FormItem name="agreed" class="agreement-item">
        <Checkbox :checked="form.agreed" :borderless="true" @change="(value: unknown) => (form.agreed = Boolean(value))">
          <template #label>
            我已阅读并同意
            <router-link to="/privacy" class="link" @click.stop>《用户协议》与《隐私政策》</router-link>
          </template>
        </Checkbox>
      </FormItem>
      <Button theme="primary" size="large" block type="submit" :loading="submitting" :disabled="submitting || closed">
        {{ closed ? '注册暂未开放' : submitting ? '注册中…' : '注 册' }}
      </Button>
      <p class="swap">已有账号？<router-link to="/login" class="link">直接登录</router-link></p>
    </Form>
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
  padding:calc(var(--app-space-9) + var(--app-space-8)) 0 var(--app-space-11);
}

.title {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-page-title);
}

.sub {
  margin:0;
  font: var(--app-type-body-sm);
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
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

/* t-form-item 默认左右布局 + 底部 hairline；本页沿用「标签在上」的既有版式 */
.form :deep(.t-form__item) {
  padding: 0;
  margin: 0 0 var(--app-space-7);
  border-bottom: none;
}

.form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.form :deep(.t-form__controls) {
  margin: 0;
}

/* 协议勾选：无表单标签（隐藏占位 label），沿用原 .agreement 的间距与字号 */
.form :deep(.agreement-item) {
  margin: var(--app-space-2) 0 var(--app-space-7);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.form :deep(.agreement-item .t-form__label) {
  display: none;
}

.channels {
  display: flex;
  gap:var(--app-space-10);
}

.code-row {
  display: flex;
  align-items: center;
  gap:var(--app-space-5);
  /* v48：本行是 .t-form__controls-content（flex）里的 flex item，默认收缩为内容宽，
   * 会让「获取验证码」按钮右边缘比主按钮短一截；显式撑满可用宽度。 */
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
  margin:var(--app-space-9) 0 0;
  text-align: center;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
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
