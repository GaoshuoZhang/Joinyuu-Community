<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Toast } from 'tdesign-mobile-vue'
import { resetPassword } from '@/api/auth'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useCaptcha } from '@/composables/useCaptcha'
import CaptchaField from '@/components/CaptchaField.vue'

/* 找回密码：手机号 + 一次性图形验证码 + 新密码。 */
const router = useRouter()
const auth = useAuthStore()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()
const form = reactive({ phone: '', captchaCode: '', password: '', confirm: '' })
const submitting = ref(false)
const errors = reactive({ phone: '', captchaCode: '', password: '', confirm: '' })

async function onSubmit() {
  Object.keys(errors).forEach((key) => { (errors as Record<string, string>)[key] = '' })
  if (!/^1\d{10}$/.test(form.phone.trim())) errors.phone = '请输入 11 位手机号'
  if (!form.captchaCode.trim()) errors.captchaCode = '请输入图形验证码'
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)) errors.password = '密码至少 8 位且包含字母与数字'
  if (form.password !== form.confirm) errors.confirm = '两次输入的密码不一致'
  const firstError = Object.values(errors).find(Boolean)
  if (firstError) {
    Toast(firstError)
    return
  }
  submitting.value = true
  try {
    await resetPassword({ phone: form.phone.trim(), captchaId: captchaId.value, captchaCode: form.captchaCode.trim(), password: form.password })
    Toast('密码已重置')
    /* v38：登录态下重置后回到账号与安全（/login 的 guestOnly 会把已登录用户弹回首页） */
    await router.replace(auth.isLogged ? '/me/security' : '/login')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '重置失败，请稍后重试')
    form.captchaCode = ''
    await refreshCaptcha().catch(() => undefined)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main id="main" class="page-fade-in m-forgot" tabindex="-1">
    <header class="hero">
      <h1 class="title">找回密码</h1>
      <p class="subtitle">验证手机号后设置新密码</p>
    </header>

    <form class="form" @submit.prevent="onSubmit">
      <div class="field">
        <label>手机号</label>
        <Input v-model="form.phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入注册手机号…" clearable />
        <p v-if="errors.phone" class="error">{{ errors.phone }}</p>
      </div>
      <CaptchaField
        v-model="form.captchaCode"
        label="图形验证码"
        :image="captchaImage"
        :loading="captchaLoading"
        :error="errors.captchaCode"
        @refresh="refreshCaptcha"
      />
      <div class="field">
        <label>新密码</label>
        <Input class="password-field" v-model="form.password" type="password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字…" clearable />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
      </div>
      <div class="field">
        <label>确认新密码</label>
        <Input class="password-field" v-model="form.confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码…" clearable />
        <p v-if="errors.confirm" class="error">{{ errors.confirm }}</p>
      </div>

      <Button theme="primary" size="large" block :loading="submitting" @click="onSubmit">重置密码</Button>
      <p class="swap">想起密码了？<router-link to="/login" class="link">返回登录</router-link></p>
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

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.swap {
  margin:var(--app-space-7) 0 0;
  font-size: var(--app-font-caption);
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
