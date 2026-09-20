<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Checkbox, Input, NoticeBar, Toast } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { ApiError } from '@/api/http'
import { isCaptcha, isPasswordStrong, isPhone, PASSWORD_MSG, PHONE_MSG, REQUIRED } from '@/utils/validators'
import { useCaptcha } from '@/composables/useCaptcha'
import CaptchaField from '@/components/CaptchaField.vue'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动注册：开关停用态 + 分步感表单（单页紧凑版）；成功即登录 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()
void config.ensureLoaded()

const form = reactive({ nickname: '', phone: '', password: '', confirmPassword: '', captchaCode: '' })
const submitting = ref(false)
const errors = reactive<Record<string, string>>({})
const closed = computed(() => !config.config.registrationOpen)
/* v38：注册须勾选同意协议（Mock 记录同意时间；真实后端需版本化留痕） */
const agreed = ref(false)

function validate(): boolean {
  errors.nickname = form.nickname.trim() ? '' : REQUIRED('昵称')
  errors.phone = isPhone(form.phone) ? '' : PHONE_MSG
  errors.password = isPasswordStrong(form.password) ? '' : PASSWORD_MSG
  errors.confirmPassword = form.confirmPassword === form.password ? '' : '两次输入的密码不一致'
  errors.captchaCode = isCaptcha(form.captchaCode) ? '' : REQUIRED('验证码')
  if (!agreed.value) errors.agreed = '请阅读并同意《用户协议》与《隐私政策》'
  else errors.agreed = ''
  const first = Object.values(errors).find((v) => v)
  if (first) Toast(first)
  return !first
}

async function onSubmit() {
  if (closed.value || !validate()) return
  submitting.value = true
  try {
    await auth.register({ ...form, captchaId: captchaId.value, agreed: agreed.value })
    notices.refreshUnread()
    Toast('注册成功，欢迎加入聚屿社区')
    await router.push('/')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '注册失败，请稍后重试')
    form.captchaCode = ''
    await refreshCaptcha().catch(() => undefined)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main id="main" class="page-fade-in m-register" tabindex="-1">
    <div class="hero">
      <h1 class="title">创建账号</h1>
      <p class="sub">注册默认获得「个人用户」身份</p>
    </div>

    <NoticeBar v-if="closed" visible theme="warning" content="注册暂未开放，请稍后再试。" class="closed-tip" />

    <div class="form">
      <div class="field">
        <label>昵称</label>
        <Input v-model="form.nickname" autocomplete="off" :spell-check="false" :maxlength="20" placeholder="请输入昵称…" :disabled="closed" />
        <p v-if="errors.nickname" class="error">{{ errors.nickname }}</p>
      </div>
      <div class="field">
        <label>手机号</label>
        <Input
          v-model="form.phone"
          type="tel"
          autocomplete="tel"
          :maxlength="11"
          placeholder="请输入手机号…"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.phone" class="error">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label>密码</label>
        <Input
          class="password-field"
          v-model="form.password"
          type="password"
          autocomplete="new-password"
          placeholder="密码（至少 8 位，含字母与数字）…"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
      </div>
      <div class="field">
        <label>确认密码</label>
        <Input
          class="password-field"
          v-model="form.confirmPassword"
          type="password"
          autocomplete="new-password"
          placeholder="请再次输入密码…"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.confirmPassword" class="error">{{ errors.confirmPassword }}</p>
      </div>
      <CaptchaField
        v-model="form.captchaCode"
        :image="captchaImage"
        :loading="captchaLoading"
        :disabled="closed"
        :error="errors.captchaCode"
        @refresh="refreshCaptcha"
        @keyup.enter="onSubmit"
      />
      <div class="agreement">
        <Checkbox :checked="agreed" :borderless="true" @change="(value: unknown) => (agreed = Boolean(value))">
          <template #label>
            我已阅读并同意
            <router-link to="/privacy" class="link" @click.stop>《用户协议》与《隐私政策》</router-link>
          </template>
        </Checkbox>
      </div>
      <p v-if="errors.agreed" class="error agreement-error">{{ errors.agreed }}</p>
      <Button theme="primary" size="large" block :loading="submitting" :disabled="submitting || closed" @click="onSubmit">
        {{ closed ? '注册暂未开放' : submitting ? '注册中…' : '注 册' }}
      </Button>
      <p class="swap">已有账号？<router-link to="/login" class="link">直接登录</router-link></p>
    </div>
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
  padding:40px 0 var(--app-space-11);
}

.title {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-title);
}

.sub {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.closed-tip {
  margin-bottom:var(--app-space-7);
}

.field {
  margin-bottom:var(--app-space-7);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.agreement {
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-3);
  margin:var(--app-space-2) 0 var(--app-space-7);
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.agreement .link {
  color: var(--td-brand-color);
}

.agreement-error {
  margin:-8px 0 var(--app-space-6);
}

.error {
  margin:var(--app-space-2) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
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
