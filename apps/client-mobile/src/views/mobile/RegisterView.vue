<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Checkbox, Input, NoticeBar, Toast } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { ApiError } from '@/api/http'
import { isCaptcha, isPasswordStrong, isPhone, PASSWORD_MSG, PHONE_MSG, REQUIRED } from '@/utils/validators'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动注册：开关停用态 + 分步感表单（单页紧凑版）；成功即登录 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()
void config.ensureLoaded()

const form = reactive({ nickname: '', phone: '', password: '', confirmPassword: '', captchaCode: '' })
const submitting = ref(false)
const errors = reactive<Record<string, string>>({})
const closed = computed(() => !config.config.registrationOpen)
/* v38：注册须勾选同意协议（Mock 记录同意时间；真实后端需版本化留痕） */
const agreed = ref(false)

function validate(): boolean {
  errors.nickname = ''
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
    await auth.register({ ...form, agreed: agreed.value })
    notices.refreshUnread()
    Toast('注册成功，欢迎加入聚屿社区')
    await router.push('/')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '注册失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-register">
    <div class="hero">
      <h1 class="title">创建账号</h1>
      <p class="sub">注册默认获得「个人用户」身份</p>
    </div>

    <NoticeBar v-if="closed" visible theme="warning" content="注册暂未开放，请稍后再试。" class="closed-tip" />

    <div class="form">
      <div class="field">
        <label>昵称（选填）</label>
        <Input v-model="form.nickname" :maxlength="20" placeholder="昵称（选填）" :disabled="closed" />
      </div>
      <div class="field">
        <label>手机号</label>
        <Input
          v-model="form.phone"
          type="tel"
          :maxlength="11"
          placeholder="手机号"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.phone" class="error">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label>密码</label>
        <Input
          v-model="form.password"
          type="password"
          placeholder="密码（至少 8 位，含字母与数字）"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.password" class="error">{{ errors.password }}</p>
      </div>
      <div class="field">
        <label>确认密码</label>
        <Input
          v-model="form.confirmPassword"
          type="password"
          placeholder="确认密码"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <p v-if="errors.confirmPassword" class="error">{{ errors.confirmPassword }}</p>
      </div>
      <div class="field captcha-row">
        <label>验证码</label>
        <Input
          v-model="form.captchaCode"
          class="captcha-input"
          :maxlength="4"
          placeholder="验证码（演示：8888）"
          :disabled="closed"
          @keyup.enter="onSubmit"
        />
        <span class="hint">8888</span>
      </div>
      <div class="agreement">
        <Checkbox :checked="agreed" @change="(value: unknown) => (agreed = Boolean(value))" />
        <span>
          我已阅读并同意
          <router-link to="/privacy" class="link">《用户协议》与《隐私政策》</router-link>
        </span>
      </div>
      <p v-if="errors.agreed" class="error agreement-error">{{ errors.agreed }}</p>
      <Button theme="primary" size="large" block :loading="submitting" :disabled="submitting || closed" @click="onSubmit">
        {{ closed ? '注册暂未开放' : submitting ? '注册中…' : '注 册' }}
      </Button>
      <p class="swap">已有账号？<router-link to="/login" class="link">直接登录</router-link></p>
    </div>
  </div>
</template>

<style scoped>
.m-register {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--td-bg-color-container);
  padding: 0 22px calc(22px + env(safe-area-inset-bottom));
}

.hero {
  padding: 40px 0 24px;
}

.title {
  margin: 0 0 6px;
  font-size: 22px;
}

.sub {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.closed-tip {
  margin-bottom: 14px;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.agreement {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.agreement .link {
  color: var(--td-brand-color);
}

.agreement-error {
  margin: -8px 0 12px;
}

.captcha-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.captcha-input {
  flex: 1;
  min-width: 0;
}

.hint {
  flex-shrink: 0;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
  padding: 10px 12px;
  border-radius: var(--td-radius-default);
  user-select: none;
}

.error {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
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
</style>
