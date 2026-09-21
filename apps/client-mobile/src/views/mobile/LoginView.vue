<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Input, Toast } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { ApiError, apiMode } from '@/api/http'
import { isCaptcha, REQUIRED } from '@/utils/validators'
import CaptchaField from '@/components/CaptchaField.vue'
import { useCaptcha } from '@/composables/useCaptcha'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动登录：全屏表单（Mock 验证码 8888）；错误用 Toast 反馈。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const notices = useNoticesStore()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()

async function onRefreshCaptcha() {
  const result = await refreshCaptcha()
  if (!result.ok) Toast(result.message ?? '验证码加载失败，请重试')
}

const form = reactive({ identifier: '', password: '', captchaCode: '' })
const submitting = ref(false)
const errors = reactive({ identifier: '', password: '', captchaCode: '' })

function validate(): boolean {
  errors.identifier = form.identifier.trim() ? '' : REQUIRED('手机号/邮箱/用户名')
  errors.password = form.password ? '' : REQUIRED('密码')
  errors.captchaCode = isCaptcha(form.captchaCode) ? '' : REQUIRED('验证码')
  return !errors.identifier && !errors.password && !errors.captchaCode
}

async function onSubmit() {
  if (!validate()) {
    Toast(Object.values(errors).find((v) => v) ?? '请完善表单')
    return
  }
  /* 验证码加载失败时 captchaId 为空，提交只会得到误导性错误：先拦截并提示 */
  if (!captchaId.value) {
    Toast('请先获取验证码')
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
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main id="main" class="page-fade-in m-login" tabindex="-1">
    <div class="hero">
      <span class="logo">聚</span>
      <h1 class="title">登录</h1>
      <p class="slogan">让每一座创业孤岛，在这里连成群岛。</p>
    </div>

    <form class="form" @submit.prevent="onSubmit">
      <div class="field">
        <label>手机号/邮箱/用户名</label>
        <Input v-model="form.identifier" type="text" autocomplete="username" placeholder="请输入手机号/邮箱/用户名…" clearable @keyup.enter="onSubmit" />
        <p v-if="errors.identifier" class="error">{{ errors.identifier }}</p>
      </div>
      <div class="field">
        <label>密码</label>
        <Input class="password-field" v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码…" clearable @keyup.enter="onSubmit" />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
        <p class="forgot"><router-link to="/forgot-password" class="link">忘记密码？</router-link></p>
      </div>
      <CaptchaField
        v-model="form.captchaCode"
        :image="captchaImage"
        :loading="captchaLoading"
        :error="errors.captchaCode"
        @refresh="onRefreshCaptcha"
        @keyup.enter="onSubmit"
      />

      <Button theme="primary" block size="large" :loading="submitting" :disabled="submitting || !captchaId" @click="onSubmit">登录</Button>
      <p class="guest"><router-link to="/" replace class="guest-link">暂不登录</router-link></p>
      <p class="swap">还没有账号？<router-link to="/register" class="link">立即注册</router-link></p>
      <p v-if="apiMode === 'mock'" class="demo">演示：13800000001 / client123</p>
    </form>
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
  padding:56px 0 var(--app-space-12);
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
  font-weight: 600;
  font-size: var(--app-font-title);
  margin-bottom:var(--app-space-7);
}

.title {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-title);
}

.slogan {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom:var(--app-space-8);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.error {
  margin:var(--app-space-2) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.guest {
  margin:var(--app-space-6) 0 0;
  text-align: center;
  font-size: var(--app-font-body);
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
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
}

.forgot {
  margin:var(--app-space-4) 0 0;
  text-align: right;
  font-size: var(--app-font-body);
}

.demo {
  margin:var(--app-space-6) 0 0;
  text-align: center;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
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
