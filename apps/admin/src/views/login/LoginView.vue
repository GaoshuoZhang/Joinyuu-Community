<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { CheckCircleIcon } from 'tdesign-icons-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useBrandingStore } from '@/stores/branding'
import { firstAccessiblePath } from '@/router'
import { fetchCaptcha, HttpError, type CaptchaResult } from '@/api/auth'
import type { FormProps } from 'tdesign-vue-next'
import { APP_VERSION } from '@/version'

const router = useRouter()
const auth = useAuthStore()
const branding = useBrandingStore()

/* 登录页品牌区取自「系统配置 → 站点信息」（站点名称/标语/logo）。
 * 品牌接口为公开读取，故未登录也能拿到真实站点品牌；失败时保留上次缓存/内置默认。 */
onMounted(() => { void branding.load() })
const SLOGAN_FALLBACK = '让每一座创业孤岛，在这里连成群岛。'

const form = reactive({
  username: '',
  password: '',
  captcha: '',
})
const captchaRequired = ref(false)
watch(() => form.username, () => {
  captchaRequired.value = false
  captcha.value = null
  form.captcha = ''
})

const rules = computed<FormProps['rules']>(() => ({
  username: [{ required: true, message: '请输入用户名', trigger: 'submit' }],
  password: [{ required: true, message: '请输入密码', trigger: 'submit' }],
  ...(captchaRequired.value ? { captcha: [{ required: true, message: '请输入验证码', trigger: 'submit' }] } : {}),
}))

const submitting = ref(false)

const captcha = ref<CaptchaResult | null>(null)
const captchaLoading = ref(false)

async function loadCaptcha() {
  if (captchaLoading.value) return
  captchaLoading.value = true
  try {
    captcha.value = await fetchCaptcha()
  } catch (e) {
    captcha.value = null
    MessagePlugin.error(e instanceof Error ? e.message : '验证码加载失败，请点击刷新重试')
  } finally {
    captchaLoading.value = false
  }
}

const onSubmit: FormProps['onSubmit'] = async ({ validateResult, firstError }) => {
  if (validateResult !== true) {
    MessagePlugin.warning(firstError as string)
    return
  }
  if (captchaRequired.value && !captcha.value) {
    MessagePlugin.warning('验证码未加载，请点击刷新后重试')
    loadCaptcha()
    return
  }
  submitting.value = true
  try {
    await auth.login(form.username, form.password, captchaRequired.value ? {
      captchaId: captcha.value?.captchaId ?? '',
      captchaCode: form.captcha,
    } : undefined)
    if (auth.passwordExpired) {
      MessagePlugin.warning('密码已过期，请先修改密码')
      router.push('/system/change-password')
      return
    }
    MessagePlugin.success('登录成功，欢迎回来')
    /* 登录成功一律进入「工作台」（首个可访问路由，工作台优先）：
     * 不再回跳登录前被拦截的页面，避免历史 URL（如 #/system/change-password）把登录落点带离工作台 */
    router.push(firstAccessiblePath())
  } catch (err) {
    MessagePlugin.error(err instanceof Error ? err.message : '登录失败，请检查用户名、密码与验证码后重试')
    form.captcha = ''
    if (err instanceof HttpError && err.status === 428) captchaRequired.value = true
    if (captchaRequired.value) void loadCaptcha()
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
      <span class="island island-1"></span>
      <span class="island island-2"></span>
      <span class="island island-3"></span>
      <div class="login-brand-wave"></div>

      <div class="brand-content">
        <div class="brand-logo">
          <img v-if="branding.siteLogo" class="brand-logo-img" :src="branding.siteLogo" alt="" />
          <svg v-else viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#FFFFFF" fill-opacity="0.16" />
            <circle cx="12.5" cy="14" r="5" fill="#7BD8F5" />
            <circle cx="20.5" cy="10.5" r="3.2" fill="#FFFFFF" />
            <path d="M5 23c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 5-2.4 7.5 0" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" />
          </svg>
        </div>
        <h1 class="brand-title">{{ branding.siteName }}</h1>
        <p class="brand-sub">{{ branding.siteName }} · 数字化运营平台</p>
        <p class="brand-slogan">{{ branding.siteSlogan || SLOGAN_FALLBACK }}</p>

        <ul class="brand-highlights">
          <li v-for="item in highlights" :key="item">
            <CheckCircleIcon />
            <span>{{ item }}</span>
          </li>
        </ul>

        <p class="brand-version">v{{ APP_VERSION }}</p>
      </div>
    </section>

    <!-- 表单区 -->
    <section class="login-form-side">
      <div class="login-form-card">
        <h2 class="form-title">欢迎回来</h2>
        <p class="form-desc">登录{{ branding.siteName }}管理后台</p>

        <t-form :data="form" :rules="rules" label-width="0" @submit="onSubmit">
          <t-form-item name="username">
            <t-input
              v-accessible-field="'用户名'"
              v-model="form.username"
              size="large"
              clearable
              name="username"
              autocomplete="username"
              :spellcheck="false"
              aria-label="用户名"
              placeholder="请输入用户名…"
            />
          </t-form-item>
          <t-form-item name="password">
            <t-input
              v-accessible-field="'密码'"
              v-model="form.password"
              size="large"
              type="password"
              clearable
              name="password"
              autocomplete="current-password"
              aria-label="密码"
              placeholder="请输入密码…"
            />
          </t-form-item>
          <t-form-item v-if="captchaRequired" name="captcha">
            <div class="captcha-row">
              <t-input
                v-accessible-field="'图形验证码'"
                v-model="form.captcha"
                class="captcha-input"
                size="large"
                clearable
                maxlength="4"
                name="captcha"
                autocomplete="one-time-code"
                aria-label="图形验证码"
                placeholder="请输入验证码…"
              />
              <t-tooltip content="点击图片刷新验证码">
                <button
                  type="button"
                  class="captcha-image-button"
                  :aria-label="captchaLoading ? '验证码刷新中' : '刷新验证码'"
                  @click="loadCaptcha"
                >
                  <img
                    v-if="captcha"
                    :src="captcha.image"
                    class="captcha-img"
                    :class="{ 'is-loading': captchaLoading }"
                    alt="验证码"
                  />
                  <span v-else class="captcha-img captcha-fallback">{{ captchaLoading ? '刷新中…' : '点击刷新' }}</span>
                </button>
              </t-tooltip>
            </div>
          </t-form-item>
          <t-form-item>
            <t-button theme="primary" type="submit" size="large" block :loading="submitting">
              登 录
            </t-button>
          </t-form-item>
        </t-form>
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

/* 站点 logo（「系统配置 → 站点信息」）：与内置 SVG 字标同尺寸、同圆角口径 */
.brand-logo-img {
  display: block;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.16);
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
  gap: 12px;
  font-size: 14px;
  opacity: 0.92;
}

.form-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.form-desc {
  margin: 8px 0 28px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.captcha-input {
  flex: 1;
}

.captcha-img {
  width: 110px;
  height: 40px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  flex-shrink: 0;
  display: block;
  box-sizing: border-box;
  transition: opacity 0.2s;
}

/* 刷新中：旧图半透明反馈加载状态 */
.captcha-img.is-loading {
  opacity: 0.4;
}

/* 验证码加载失败占位：与图片等尺寸，可点击重试 */
.captcha-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  background: var(--td-bg-color-secondarycontainer);
}

.captcha-image-button {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: var(--td-radius-medium);
  cursor: pointer;
}

/* 品牌区装饰岛：在全局 .island 基类（tokens.css）上做定位/尺寸/透明度变体。
 * 色值豁免：品牌资产装饰色（与 tokens.css 登录品牌区渐变同口径，刻意不随主题切换） */
.island-1 { width: 120px; height: 120px; right: 18%; top: 12%; }
.island-2 { width: 56px; height: 56px; right: 8%; top: 40%; background: rgba(255, 255, 255, 0.14); }
.island-3 { width: 200px; height: 200px; left: -60px; bottom: 10%; background: rgba(123, 216, 245, 0.12); }

/* 品牌区中的版本号：继承品牌区文字色、仅降低对比度（渐变面板上的次级文案，
 * 不套用 TDesign 语义色，与同区 brand-title/brand-sub 同口径） */
.brand-version {
  margin: 20px 0 0;
  font-size: 12px;
  line-height: 20px;
  opacity: 0.6;
}
</style>
