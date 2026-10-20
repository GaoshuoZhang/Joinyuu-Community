<script setup lang="ts">
import PasswordInput from '@/components/shared/PasswordInput.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Form, FormItem, Input, NoticeBar, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { useConfigStore } from '@/stores/config'
import { ApiError } from '@/api/http'
import { fetchEmailAvailable, fetchSmsAvailable, sendEmailCode, sendSmsCode } from '@/api/auth'
import { CODE_MSG, isSmsCode, parseIdentifier, REQUIRED } from '@/utils/validators'
import type { IdentifierKind } from '@/utils/validators'
import CaptchaField from '@/components/CaptchaField.vue'
import AgreementConsent from '@/components/auth/AgreementConsent.vue'
import CustomerBrandLogo from '@/components/CustomerBrandLogo.vue'
import { useCustomerThemeStore } from '@/stores/customerTheme'
import { useCaptcha } from '@/composables/useCaptcha'
import 'tdesign-mobile-vue/es/style/index.css'

/* 统一「登录或注册」入口（两屏）：
 * ① 只输入手机号/邮箱/用户名 → ② 按标识类型给出密码或验证码。
 * 手机号/邮箱的验证码由服务端在验证通过后决定「登录」还是「建号」（isNewUser），
 * 客户端全程不需要知道账号是否存在；用户名仅支持密码登录，且服务端对存在与否返回同一句错误（防枚举）。
 * v46：校验走 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const customerTheme = useCustomerThemeStore()
const notices = useNoticesStore()
const configStore = useConfigStore()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()

/* 只影响「用户名注册」兜底入口与验证码屏提示；失败保持默认开关，不打断登录 */
void configStore.ensureLoaded().catch(() => {})
const registrationOpen = computed(() => configStore.config.registrationOpen)

const step = ref<1 | 2>(1)
/** 第二屏登录方式：密码优先（省短信/邮件开销），可切验证码 */
const mode = ref<'password' | 'code'>('password')
/** 标识类型（第二屏据此刻画可用方式）：用户名仅密码 */
const kind = ref<IdentifierKind>('username')
/** 归一化后的登录标识（手机号 11 位 / 邮箱小写 / 用户名小写），第二屏展示与提交都用它 */
const account = ref('')
const smsAvailable = ref(false)
const emailAvailable = ref(false)

const form = reactive({ identifier: '', password: '', code: '', captchaCode: '', agreed: false })
const captchaRequired = ref(false)
const submitting = ref(false)
const sending = ref(false)
const countdown = ref(0)
const step2FormRef = ref<FormInstanceFunctions>()

/* 首次加载验证码失败时提示一次（后续重试由 onRefreshCaptcha 自行提示）；
 * captchaId 为空即视为加载失败——按加载结束的时刻判断，避免依赖刷新返回值 */
let captchaFailureNotified = false
watch(captchaLoading, (loading) => {
  if (!captchaRequired.value || loading || captchaFailureNotified || captchaId.value) return
  captchaFailureNotified = true
  Toast('验证码加载失败，请点击图片重试')
})
/* 换标识即换账号：密码失败计数与图形验证码状态都要复位 */
watch(() => form.identifier, () => {
  captchaRequired.value = false
  form.captchaCode = ''
})

/* 通道可用性：探测失败一律按「不可用」处理（不默认放开），口径与注册页一致 */
onMounted(async () => {
  const [emailResult, smsResult] = await Promise.allSettled([fetchEmailAvailable(), fetchSmsAvailable()])
  emailAvailable.value = emailResult.status === 'fulfilled' ? emailResult.value : false
  smsAvailable.value = smsResult.status === 'fulfilled' ? smsResult.value : false
  if (emailResult.status === 'rejected' || smsResult.status === 'rejected') {
    Toast('通道可用性检测失败，部分登录方式可能暂时不可用')
  }
})

/* 当前标识对应的验证渠道是否可用（用户名没有验证渠道） */
const channelAvailable = computed(() => (
  kind.value === 'phone' ? smsAvailable.value : kind.value === 'email' ? emailAvailable.value : false
))
/* 验证码入口不可用时的说明：单缺提示改用另一渠道，双缺按构思回落密码登录 */
const channelTip = computed(() => {
  if (kind.value === 'username' || channelAvailable.value) return ''
  if (!smsAvailable.value && !emailAvailable.value) return '短信与邮箱通道均未启用，请使用密码登录。'
  return kind.value === 'phone'
    ? '短信通道未启用，请改用邮箱登录，或使用密码登录。'
    : '邮箱通道未启用，请改用手机号登录，或使用密码登录。'
})
/* 双通道都不可用时不再有验证码注册，「用户名 + 密码」注册作为兜底入口（构思第 6 条） */
const showUsernameRegister = computed(() => !smsAvailable.value && !emailAvailable.value)

const rules = computed<FormRules<typeof form>>(() => {
  if (step.value === 1) {
    return {
      identifier: [
        { required: true, message: REQUIRED('手机号/邮箱/用户名') },
        /* TDesign 的 required 只拦 ''/null/undefined，纯空白会通过；不拦会让「下一步」点了没反应 */
        { validator: (val: string) => Boolean((val ?? '').trim()), message: REQUIRED('手机号/邮箱/用户名') },
      ],
    }
  }
  if (mode.value === 'code') {
    return {
      code: [
        { required: true, message: CODE_MSG },
        { validator: (val: string) => !val.trim() || isSmsCode(val), message: CODE_MSG },
      ],
      agreed: [{ validator: (val: unknown) => Boolean(val), message: '请阅读并同意《用户协议》与《隐私政策》' }],
    }
  }
  return {
    password: [{ required: true, message: REQUIRED('密码') }],
    ...(captchaRequired.value ? { captchaCode: [{ required: true, message: REQUIRED('验证码') }] } : {}),
  }
})

async function onRefreshCaptcha() {
  const result = await refreshCaptcha()
  if (!result.ok) Toast(result.message ?? '验证码加载失败，请重试')
}

/* ---- 第一屏：解析标识并进入第二屏 ---- */
function onStep1() {
  const parsed = parseIdentifier(form.identifier)
  if (!parsed) return
  account.value = parsed.value
  kind.value = parsed.kind
  mode.value = 'password'
  step.value = 2
}

function onStep1Submit({ validateResult }: { validateResult: unknown }) {
  if (validateResult === true) onStep1()
}

/* ---- 第二屏：方式切换与返回 ---- */
function switchToCode() {
  mode.value = 'code'
  form.captchaCode = ''
  step2FormRef.value?.clearValidate(['password', 'captchaCode'])
}

function switchToPassword() {
  mode.value = 'password'
  form.code = ''
  step2FormRef.value?.clearValidate(['code', 'agreed'])
  if (captchaRequired.value) void refreshCaptcha()
}

function backToStep1() {
  step.value = 1
  mode.value = 'password'
  captchaRequired.value = false
  form.password = ''
  form.captchaCode = ''
  form.code = ''
  form.agreed = false
  stopCountdown()
}

/* ---- 验证码：60s 倒计时（与注册页同口径） ---- */
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
  /* 先确认已同意协议再发码：服务端对验证码登录统一要求 agreed=true，避免发出必然无法使用的验证码 */
  if (!form.agreed) {
    Toast('请阅读并同意《用户协议》与《隐私政策》')
    return
  }
  if (kind.value === 'username' || !account.value) return
  sending.value = true
  try {
    const result = kind.value === 'phone'
      ? await sendSmsCode({ phone: account.value, purpose: 'login' })
      : await sendEmailCode({ email: account.value, purpose: 'login' })
    Toast(result.devCode ? `验证码已发送（演示码 ${result.devCode}）` : '验证码已发送')
    startCountdown()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '验证码发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

/* ---- 提交 ---- */
async function afterLogin(isNewUser: boolean) {
  notices.refreshUnread()
  Toast(isNewUser ? '注册成功，欢迎加入聚屿社区' : `欢迎回来，${auth.name}`)
  await router.push(String(route.query.redirect ?? '/'))
}

async function onPasswordSubmit() {
  /* 仅在服务端要求验证码后才检查验证码资源是否加载完成。 */
  if (captchaRequired.value && !captchaId.value) {
    Toast('验证码加载失败，请点击图片重试')
    return
  }
  submitting.value = true
  try {
    await auth.login({
      identifier: account.value,
      password: form.password,
      ...(captchaRequired.value ? { captchaId: captchaId.value, captchaCode: form.captchaCode } : {}),
    })
    await afterLogin(false)
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '登录失败，请稍后重试')
    form.captchaCode = ''
    if (e instanceof ApiError && e.code === 428) captchaRequired.value = true
    if (captchaRequired.value) await refreshCaptcha()
    /* API 失败清空验证码输入后不残留字段级错误提示 */
    void nextTick(() => step2FormRef.value?.clearValidate(['captchaCode']))
  } finally {
    submitting.value = false
  }
}

async function onCodeSubmit() {
  if (kind.value === 'username' || !account.value) return
  submitting.value = true
  try {
    const isNewUser = await auth.loginByCode({
      channel: kind.value,
      account: account.value,
      code: form.code.trim(),
      agreed: form.agreed,
    })
    await afterLogin(isNewUser)
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '登录失败，请稍后重试')
    form.code = ''
    void nextTick(() => step2FormRef.value?.clearValidate(['code']))
  } finally {
    submitting.value = false
  }
}

function onStep2Submit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult !== true) return
  if (mode.value === 'code') void onCodeSubmit()
  else void onPasswordSubmit()
}
</script>

<template>
  <main id="main" class="page-fade-in m-login" tabindex="-1">
    <router-link to="/" replace class="guest-link" aria-label="暂不登录，返回首页">暂不登录</router-link>
    <div class="hero">
      <CustomerBrandLogo v-if="customerTheme.theme?.brand?.logo" :brand="customerTheme.theme.brand" />
      <span v-else class="logo">聚</span>
      <!-- 可见标题已移除（用户要求）：仅保留 h1 供读屏与文档结构，视觉上 Logo 下紧接口号 -->
      <h1 class="sr-only">登录或注册</h1>
      <p class="slogan">{{ customerTheme.theme?.brand?.slogan || '让每一座创业孤岛，在这里连成群岛。' }}</p>
    </div>

    <!-- 第一屏：只输入登录标识 -->
    <Form
      v-if="step === 1"
      class="form"
      :data="form"
      :rules="rules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onStep1Submit"
    >
      <FormItem label="手机号/邮箱/用户名" name="identifier">
        <Input v-model="form.identifier" type="text" autocomplete="username" placeholder="请输入手机号/邮箱/用户名…" clearable />
      </FormItem>
      <p class="hint">未注册的手机号/邮箱，验证后将为你创建新账号；用户名仅支持密码登录。</p>
      <Button theme="primary" block size="large" type="submit">下一步</Button>
    </Form>

    <!-- 第二屏：按标识类型给出密码 / 验证码 -->
    <template v-else>
      <NoticeBar
        v-if="mode === 'code' && !registrationOpen"
        visible
        theme="warning"
        content="注册暂未开放；已有账号仍可使用验证码登录。"
        class="notice-tip"
      />
      <Form
        ref="step2FormRef"
        class="form"
        :data="form"
        :rules="rules"
        label-align="top"
        scroll-to-first-error="smooth"
        @submit="onStep2Submit"
      >
        <FormItem label="账号">
          <Input :model-value="account" disabled />
        </FormItem>

        <template v-if="mode === 'password'">
          <!-- 忘记密码移到「密码」字段标签行右侧，避开明文切换图标，同时省掉一整行 -->
          <FormItem name="password" class="password-item">
            <template #label>
              <span class="password-label">
                <span>密码</span>
                <router-link to="/forgot-password" class="link">忘记密码？</router-link>
              </span>
            </template>
            <PasswordInput class="password-field" v-model="form.password" autocomplete="current-password" placeholder="请输入密码…" clearable />
          </FormItem>
          <FormItem v-if="captchaRequired" name="captchaCode" class="captcha-item">
            <CaptchaField
              v-model="form.captchaCode"
              :image="captchaImage"
              :loading="captchaLoading"
              @refresh="onRefreshCaptcha"
            />
          </FormItem>

          <Button theme="primary" block size="large" type="submit" :loading="submitting" :disabled="submitting">登录</Button>

          <p v-if="channelAvailable" class="swap"><a v-pressable class="link" @click="switchToCode">使用验证码登录</a></p>
          <p v-else-if="channelTip" class="hint">{{ channelTip }}</p>
          <p v-if="showUsernameRegister" class="swap">
            无法使用验证码？<router-link :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="link">用户名注册</router-link>
          </p>
        </template>

        <template v-else>
          <FormItem label="验证码" name="code">
            <div class="code-row">
              <Input
                v-model="form.code"
                class="code-input"
                :maxlength="6"
                inputmode="numeric"
                :spell-check="false"
                placeholder="请输入 6 位验证码…"
              />
              <Button
                class="code-button"
                variant="outline"
                theme="primary"
                type="button"
                :disabled="sending || countdown > 0"
                @click="onSendCode"
              >
                {{ countdown > 0 ? `${countdown}s` : sending ? '发送中…' : '获取验证码' }}
              </Button>
            </div>
          </FormItem>
          <FormItem name="agreed" class="agreement-item">
            <AgreementConsent v-model="form.agreed" tip="验证成功后将为你创建新账号（若尚未注册）。" />
          </FormItem>

          <Button theme="primary" block size="large" type="submit" :loading="submitting" :disabled="submitting">登录 / 注册</Button>
          <p class="swap"><a v-pressable class="link" @click="switchToPassword">使用密码登录</a></p>
        </template>

        <p class="swap"><a v-pressable class="link" @click="backToStep1">返回上一步</a></p>
      </Form>
    </template>
  </main>
</template>

<style scoped>
.m-login {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 var(--app-space-11) calc(var(--app-space-11) + env(safe-area-inset-bottom));
}

/* 暂不登录：移到页面右上角（绝对定位，保持 44px 命中区） */
.guest-link {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding:0 var(--app-space-8);
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.hero {
  padding:calc(var(--app-space-12) + var(--app-space-9)) 0 var(--app-space-12);
  text-align: center;
}

.logo {
  display: inline-grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  font: var(--app-type-display);
  margin-bottom:var(--app-space-7);
}

/* 客户 Logo 与公版 logo 保持同一下间距（标题移除后 Logo 与口号直接相邻） */
.hero :deep(.customer-brand-logo) {
  margin-bottom: var(--app-space-7);
}

.slogan {
  white-space: pre-line;
  overflow-wrap: anywhere;
  margin:0;
  font: var(--app-type-body-sm);
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
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.form :deep(.t-form__controls) {
  margin: 0;
}

/* 说明文案（第一屏提示 / 通道不可用降级说明）：caption 档 + 次级文字色 */
.hint {
  margin: 0 0 var(--app-space-8);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* 图形验证码：CaptchaField 自带「验证码」标签，隐藏 FormItem 占位 label */
.form :deep(.captcha-item .t-form__label) {
  display: none;
}

/* 协议勾选：容器是 AgreementConsent（自带行布局与弹层），此处只管 FormItem 间距与占位 label */
.form :deep(.agreement-item) {
  margin: var(--app-space-2) 0 var(--app-space-8);
}

.form :deep(.agreement-item .t-form__label) {
  display: none;
}

/* 密码字段标签行：左侧「密码」、右侧「忘记密码？」两端对齐。
 * 必填红星是 `.t-form__label--required label::before`（inline-block），若标签行仍是块级布局、
 * 而 .password-label 是块级 flex，红星就会被挤到单独一行；故把整行改为 flex 行，红星与内容同排。 */
.password-item :deep(.t-form__label) {
  width: 100%;
  display: flex;
  align-items: center;
}

.password-item :deep(.t-form__label > label) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.password-label {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-8);
}

.notice-tip {
  margin-bottom:var(--app-space-7);
}

.code-row {
  display: flex;
  align-items: center;
  gap:var(--app-space-5);
  /* 本行是 .t-form__controls-content（flex）里的 flex item，默认收缩为内容宽，
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
  margin:var(--app-space-8) 0 0;
  text-align: center;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

/* 文字链（忘记密码/切换登录方式/返回上一步）：撑到 44px 命中区并居中，按压时降低不透明度 */
.link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--td-brand-color);
}

.link:active {
  opacity: 0.72;
}
</style>
