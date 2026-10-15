<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Form, FormItem, Input, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { ApiError } from '@/api/http'
import { REQUIRED } from '@/utils/validators'
import CaptchaField from '@/components/CaptchaField.vue'
import CustomerBrandLogo from '@/components/CustomerBrandLogo.vue'
import { useCustomerThemeStore } from '@/stores/customerTheme'
import { useCaptcha } from '@/composables/useCaptcha'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动登录：全屏表单（服务端图形验证码）。
 * v46：校验迁移到 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const customerTheme = useCustomerThemeStore()
const notices = useNoticesStore()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()

async function onRefreshCaptcha() {
  const result = await refreshCaptcha()
  if (!result.ok) Toast(result.message ?? '验证码加载失败，请重试')
}

/* 首次加载验证码失败时提示一次（后续重试由 onRefreshCaptcha 自行提示）；
 * captchaId 为空即视为加载失败——按加载结束的时刻判断，避免依赖刷新返回值 */
let captchaFailureNotified = false
watch(captchaLoading, (loading) => {
  if (loading || captchaFailureNotified || captchaId.value) return
  captchaFailureNotified = true
  Toast('验证码加载失败，请点击图片重试')
})

const form = reactive({ identifier: '', password: '', captchaCode: '' })
const submitting = ref(false)
const formRef = ref<FormInstanceFunctions>()

const rules: FormRules<typeof form> = {
  identifier: [{ required: true, message: REQUIRED('手机号/邮箱/用户名') }],
  password: [{ required: true, message: REQUIRED('密码') }],
  captchaCode: [{ required: true, message: REQUIRED('验证码') }],
}

async function onSubmit() {
  /* 验证码加载失败时 captchaId 为空，提交只会得到误导性错误：按钮保持可点，点击时说明原因 */
  if (!captchaId.value) {
    Toast('验证码加载失败，请点击图片重试')
    return
  }
  submitting.value = true
  try {
    await auth.login({ ...form, captchaId: captchaId.value })
    notices.refreshUnread()
    Toast(`欢迎回来，${auth.name}`)
    await router.push(String(route.query.redirect ?? '/'))
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '登录失败，请稍后重试')
    form.captchaCode = ''
    await refreshCaptcha()
    /* API 失败清空验证码输入后不残留字段级错误提示 */
    void nextTick(() => formRef.value?.clearValidate(['captchaCode']))
  } finally {
    submitting.value = false
  }
}

function onLoginSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) void onSubmit()
}
</script>

<template>
  <main id="main" class="page-fade-in m-login" tabindex="-1">
    <div class="hero">
      <CustomerBrandLogo v-if="customerTheme.theme?.brand?.logo" :brand="customerTheme.theme.brand" />
      <span v-else class="logo">聚</span>
      <h1 class="title">登录</h1>
      <p class="slogan">{{ customerTheme.theme?.brand?.slogan || '让每一座创业孤岛，在这里连成群岛。' }}</p>
    </div>

    <Form
      ref="formRef"
      class="form"
      :data="form"
      :rules="rules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onLoginSubmit"
    >
      <FormItem label="手机号/邮箱/用户名" name="identifier">
        <Input v-model="form.identifier" type="text" autocomplete="username" placeholder="请输入手机号/邮箱/用户名…" clearable />
      </FormItem>
      <FormItem label="密码" name="password">
        <Input class="password-field" v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码…" clearable />
      </FormItem>
      <FormItem name="captchaCode" class="captcha-item">
        <CaptchaField
          v-model="form.captchaCode"
          :image="captchaImage"
          :loading="captchaLoading"
          @refresh="onRefreshCaptcha"
        />
      </FormItem>

      <Button theme="primary" block size="large" type="submit" :loading="submitting" :disabled="submitting">登录</Button>
      <!-- v48：忘记密码从密码框右侧（与明文切换图标重叠）移到登录按钮下方、暂不登录上方 -->
      <p class="forgot"><router-link to="/forgot-password" class="link">忘记密码？</router-link></p>
      <p class="guest"><router-link to="/" replace class="guest-link">暂不登录</router-link></p>
      <p class="swap">还没有账号？<router-link :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="link">立即注册</router-link></p>
    </Form>
  </main>
</template>

<style scoped>
.m-login {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 var(--app-space-11) calc(var(--app-space-11) + env(safe-area-inset-bottom));
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

.title {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-page-title);
}

.slogan {
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

/* 图形验证码：CaptchaField 自带「验证码」标签，隐藏 FormItem 占位 label */
.form :deep(.captcha-item .t-form__label) {
  display: none;
}

.guest {
  margin:var(--app-space-6) 0 0;
  text-align: center;
  font: var(--app-type-body);
}

.guest-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding:0 var(--app-space-8);
  color: var(--td-text-color-secondary);
}

.swap {
  margin:var(--app-space-9) 0 0;
  text-align: center;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

/* 文字链（忘记密码/立即注册）：撑到 44px 命中区并居中，按压时降低不透明度 */
.link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: var(--td-brand-color);
}

.link:active {
  opacity: 0.72;
}

/* v48：忘记密码移到登录按钮下方（原先位于密码框右侧，与明文切换图标重叠），
 * 与「暂不登录 / 立即注册」同为居中文字链，保留 44px 命中区。 */
.forgot {
  margin:var(--app-space-6) 0 0;
  text-align: center;
  font: var(--app-type-body);
}

/* v48：官方 suffix 槽自带 padding-left: 12px；此前固定 flex-basis/width 为 24px，会连同内距
 * 把明文切换图标挤出密码框右边缘 12px。宽度交回官方（flex: 0 0 auto），这里只保证垂直居中。 */
.password-field :deep(.t-input__wrap--suffix-icon) {
  display: flex;
  align-items: center;
}

.password-field :deep(.t-input--password) {
  letter-spacing: 0;
}
</style>
