<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { CheckCircleIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import { useAuthStore } from '@/stores/auth'
import { fetchCaptcha, type CaptchaResult } from '@/api/auth'
import type { FormProps } from 'tdesign-vue-next'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const form = reactive({
  username: '',
  password: '',
  captcha: '',
})

const rules: FormProps['rules'] = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  captcha: [{ required: true, message: '请输入验证码', trigger: 'blur' }],
}

const submitting = ref(false)

const captcha = ref<CaptchaResult | null>(null)

async function loadCaptcha() {
  try {
    captcha.value = await fetchCaptcha()
  } catch (e) {
    captcha.value = null
    MessagePlugin.error(e instanceof Error ? e.message : '验证码加载失败，请点击刷新重试')
  }
}

onMounted(loadCaptcha)

const onSubmit: FormProps['onSubmit'] = async ({ validateResult, firstError }) => {
  if (validateResult !== true) {
    MessagePlugin.warning(firstError as string)
    return
  }
  if (!captcha.value) {
    MessagePlugin.warning('验证码未加载，请点击刷新后重试')
    loadCaptcha()
    return
  }
  submitting.value = true
  try {
    await auth.login(form.username, form.password, {
      captchaId: captcha.value?.captchaId ?? '',
      captchaCode: form.captcha,
    })
    MessagePlugin.success('登录成功，欢迎回来')
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '登录失败，请稍后重试')
    form.captcha = ''
    loadCaptcha()
  } finally {
    submitting.value = false
  }
}

const highlights = ['企业与需求双向连接', '活动运营与签到管理', '跨企业项目协作', '积分与空间运营']
</script>

<template>
  <div class="login-page">
    <!-- 品牌区 -->
    <section class="login-brand">
      <span class="island" style="width: 120px; height: 120px; right: 18%; top: 12%"></span>
      <span class="island" style="width: 56px; height: 56px; right: 8%; top: 40%; background: rgba(255, 255, 255, 0.14)"></span>
      <span class="island" style="width: 200px; height: 200px; left: -60px; bottom: 10%; background: rgba(123, 216, 245, 0.12)"></span>
      <div class="login-brand-wave"></div>

      <div class="brand-content">
        <div class="brand-logo">
          <svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#FFFFFF" fill-opacity="0.16" />
            <circle cx="12.5" cy="14" r="5" fill="#7BD8F5" />
            <circle cx="20.5" cy="10.5" r="3.2" fill="#FFFFFF" />
            <path d="M5 23c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 5-2.4 7.5 0" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" />
          </svg>
        </div>
        <h1 class="brand-title">聚屿社区</h1>
        <p class="brand-sub">Joinyuu Community · 数字化运营平台</p>
        <p class="brand-slogan">让每一座创业孤岛，在这里连成群岛。</p>

        <ul class="brand-highlights">
          <li v-for="item in highlights" :key="item">
            <CheckCircleIcon />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- 表单区 -->
    <section class="login-form-side">
      <div class="login-form-card">
        <h2 class="form-title">欢迎回来</h2>
        <p class="form-desc">登录聚屿社区管理后台</p>

        <t-form :data="form" :rules="rules" label-width="0" @submit="onSubmit">
          <t-form-item name="username">
            <t-input v-model="form.username" size="large" clearable placeholder="请输入用户名" />
          </t-form-item>
          <t-form-item name="password">
            <t-input
              v-model="form.password"
              size="large"
              type="password"
              clearable
              placeholder="请输入密码"
            />
          </t-form-item>
          <t-form-item name="captcha">
            <div class="captcha-row">
              <t-input
                v-model="form.captcha"
                size="large"
                clearable
                maxlength="4"
                placeholder="验证码"
                style="flex: 1"
              />
              <img
                v-if="captcha"
                :src="captcha.image"
                class="captcha-img"
                alt="验证码"
                title="点击刷新"
                @click="loadCaptcha"
              />
              <t-button variant="text" shape="square" size="large" @click="loadCaptcha">
                <template #icon><RefreshIcon /></template>
              </t-button>
            </div>
          </t-form-item>
          <t-form-item>
            <t-button theme="primary" type="submit" size="large" block :loading="submitting">
              登 录
            </t-button>
          </t-form-item>
        </t-form>

        <div class="demo-account">
          演示账号：<code>admin</code> / <code>admin123</code>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.brand-content {
  position: relative;
  z-index: 1;
}

.brand-logo {
  margin-bottom: 24px;
}

.brand-title {
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 2px;
}

.brand-sub {
  margin: 8px 0 0;
  font-size: 14px;
  opacity: 0.78;
}

.brand-slogan {
  margin: 28px 0 0;
  font-size: 16px;
  line-height: 1.7;
  max-width: 360px;
}

.brand-highlights {
  list-style: none;
  margin: 32px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.brand-highlights li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  opacity: 0.92;
}

.form-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.form-desc {
  margin: 6px 0 28px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.demo-account {
  margin-top: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-medium);
  text-align: center;
}

.demo-account code {
  font-family: var(--td-font-family);
  color: var(--td-brand-color);
  font-weight: 600;
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.captcha-img {
  width: 110px;
  height: 40px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  cursor: pointer;
  flex-shrink: 0;
}
</style>
