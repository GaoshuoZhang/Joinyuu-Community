<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Toast } from 'tdesign-mobile-vue'
import { resetPassword } from '@/api/auth'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

/* 找回密码（v38 [MOCK-ONLY]）：手机号 + 短信验证码（演示 8888）+ 新密码；接入期接短信通道与频率限制。 */
const router = useRouter()
const auth = useAuthStore()
const form = reactive({ phone: '', captchaCode: '', password: '', confirm: '' })
const submitting = ref(false)
const errors = reactive({ phone: '', captchaCode: '', password: '', confirm: '' })

async function onSubmit() {
  Object.keys(errors).forEach((key) => { (errors as Record<string, string>)[key] = '' })
  if (!/^1\d{10}$/.test(form.phone.trim())) errors.phone = '请输入正确的手机号'
  if (!form.captchaCode.trim()) errors.captchaCode = '请输入短信验证码'
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password)) errors.password = '密码至少 8 位且包含字母与数字'
  if (form.password !== form.confirm) errors.confirm = '两次输入的密码不一致'
  const firstError = Object.values(errors).find(Boolean)
  if (firstError) {
    Toast(firstError)
    return
  }
  submitting.value = true
  try {
    await resetPassword({ phone: form.phone.trim(), captchaCode: form.captchaCode.trim(), password: form.password })
    Toast('密码已重置')
    /* v38：登录态下重置后回到账号与安全（/login 的 guestOnly 会把已登录用户弹回首页） */
    await router.replace(auth.isLogged ? '/me/security' : '/login')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '重置失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-forgot">
    <header class="hero">
      <h1 class="title">找回密码</h1>
      <p class="subtitle">验证手机号后设置新密码（演示验证码 8888）</p>
    </header>

    <div class="form">
      <div class="field">
        <label>手机号</label>
        <Input v-model="form.phone" type="tel" :maxlength="11" placeholder="请输入注册手机号" clearable />
        <p v-if="errors.phone" class="error">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label>短信验证码</label>
        <Input v-model="form.captchaCode" :maxlength="4" placeholder="验证码（演示：8888）" />
        <p v-if="errors.captchaCode" class="error">{{ errors.captchaCode }}</p>
      </div>
      <div class="field">
        <label>新密码</label>
        <Input v-model="form.password" type="password" placeholder="至少 8 位，含字母与数字" clearable />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
      </div>
      <div class="field">
        <label>确认新密码</label>
        <Input v-model="form.confirm" type="password" placeholder="再次输入新密码" clearable />
        <p v-if="errors.confirm" class="error">{{ errors.confirm }}</p>
      </div>

      <Button theme="primary" size="large" block :loading="submitting" @click="onSubmit">重置密码</Button>
      <p class="swap">想起密码了？<router-link to="/login" class="link">返回登录</router-link></p>
    </div>
  </div>
</template>

<style scoped>
.m-forgot {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 22px calc(22px + env(safe-area-inset-bottom));
}

.hero {
  padding: 48px 0 24px;
}

.title {
  margin: 0 0 6px;
  font-size: 22px;
}

.subtitle {
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

.error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.swap {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
}
</style>
