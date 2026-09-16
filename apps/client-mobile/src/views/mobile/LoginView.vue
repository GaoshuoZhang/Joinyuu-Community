<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Input, Toast } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { ApiError } from '@/api/http'
import { isCaptcha, isPhone, PHONE_MSG, REQUIRED } from '@/utils/validators'
import { useCaptcha } from '@/composables/useCaptcha'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动登录：全屏表单（Mock 验证码 8888）；错误用 Toast 反馈。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const notices = useNoticesStore()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()

const form = reactive({ phone: '', password: '', captchaCode: '' })
const submitting = ref(false)
const errors = reactive({ phone: '', password: '', captchaCode: '' })

function validate(): boolean {
  errors.phone = isPhone(form.phone) ? '' : PHONE_MSG
  errors.password = form.password ? '' : REQUIRED('密码')
  errors.captchaCode = isCaptcha(form.captchaCode) ? '' : REQUIRED('验证码')
  return !errors.phone && !errors.password && !errors.captchaCode
}

async function onSubmit() {
  if (!validate()) {
    Toast(Object.values(errors).find((v) => v) ?? '请完善表单')
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
    await refreshCaptcha().catch(() => undefined)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-login">
    <div class="hero">
      <span class="logo">聚</span>
      <h1 class="title">聚屿社区</h1>
      <p class="slogan">让每一座创业孤岛，在这里连成群岛。</p>
    </div>

    <div class="form">
      <div class="field">
        <label>手机号</label>
        <Input v-model="form.phone" type="tel" :maxlength="11" placeholder="手机号" clearable @keyup.enter="onSubmit" />
        <p v-if="errors.phone" class="error">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label>密码</label>
        <Input v-model="form.password" type="password" placeholder="密码" clearable @keyup.enter="onSubmit" />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
        <p class="forgot"><router-link to="/forgot-password" class="link">忘记密码？</router-link></p>
      </div>
      <div class="field">
        <label>验证码</label>
        <div class="captcha-row">
          <Input v-model="form.captchaCode" :maxlength="4" placeholder="请输入验证码" @keyup.enter="onSubmit" />
          <button class="captcha-button" type="button" :disabled="captchaLoading" aria-label="刷新验证码" @click="refreshCaptcha">
            <img v-if="captchaImage" :src="captchaImage" alt="图形验证码" />
            <span v-else>刷新</span>
          </button>
        </div>
        <p v-if="errors.captchaCode" class="error">{{ errors.captchaCode }}</p>
      </div>

      <Button theme="primary" block size="large" :loading="submitting" @click="onSubmit">登录</Button>
      <p class="guest"><router-link to="/" replace class="guest-link">暂不登录</router-link></p>
      <p class="swap">还没有账号？<router-link to="/register" class="link">立即注册</router-link></p>
      <p class="demo">演示：13800000001 / client123</p>
    </div>
  </div>
</template>

<style scoped>
.m-login {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 22px calc(22px + env(safe-area-inset-bottom));
}

.hero {
  padding: 56px 0 32px;
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
  font-weight: 700;
  font-size: 24px;
  margin-bottom: 14px;
}

.title {
  margin: 0 0 6px;
  font-size: 22px;
}

.slogan {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.captcha-row :deep(.t-input) {
  flex: 1;
  min-width: 0;
}

.captcha-button {
  flex-shrink: 0;
  padding: 0;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
  border-radius: var(--td-radius-default);
  user-select: none;
  border: 0;
  overflow: hidden;
  min-width: 96px;
  min-height: 40px;
}

.captcha-button img {
  display: block;
  width: 96px;
  height: 40px;
}

.error {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.guest {
  margin: 12px 0 0;
  text-align: center;
  font-size: 14px;
}

.guest-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  color: var(--td-text-color-secondary);
}

.swap {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
}

.forgot {
  margin: 8px 0 0;
  text-align: right;
  font-size: 13px;
}

.demo {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
