<script setup lang="ts">
import PasswordInput from '@/components/shared/PasswordInput.vue'
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Form, FormItem, Input, NoticeBar, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import AgreementConsent from '@/components/auth/AgreementConsent.vue'
import { ApiError } from '@/api/http'
import { isPasswordStrong, isReservedUsername, isUsername, PASSWORD_MSG, REQUIRED, USERNAME_MSG, USERNAME_RESERVED_MSG } from '@/utils/validators'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动注册（兜底页）：**仅**「用户名 + 密码」渠道。
 * 短信/邮箱通道可用时注册统一走登录页的验证码流程（验证后由服务端自动建号），本页不再提供验证码渠道；
 * 只有两种通道都不可用时，登录页才给出本页入口（否则用户无法完成任何注册）。
 * 用户名注册不产生可信通知渠道，故不支持验证码登录、也无法自助找回密码——页内已明示。
 * v46：校验走 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()
void config.ensureLoaded()

const form = reactive({ username: '', password: '', confirmPassword: '', agreed: false })
const submitting = ref(false)
const formRef = ref<FormInstanceFunctions>()
const closed = computed(() => !config.config.registrationOpen)

/* 长表单离开保护：任一字段有内容即视为未保存；注册成功后先 markClean 再跳转，避免误拦 */
const hasUnsavedInput = computed(() => Boolean(
  form.username.trim() || form.password || form.confirmPassword,
))
const { markClean } = useUnsavedGuard(() => hasUnsavedInput.value)

const rules: FormRules<typeof form> = {
  username: [
    { required: true, message: REQUIRED('用户名') },
    { validator: (val: string) => !val.trim() || isUsername(val), message: USERNAME_MSG },
    { validator: (val: string) => !val.trim() || !isReservedUsername(val), message: USERNAME_RESERVED_MSG },
  ],
  password: [
    { required: true, message: PASSWORD_MSG },
    { validator: (val: string) => !val.trim() || isPasswordStrong(val), message: PASSWORD_MSG },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码' },
    { validator: (val: string) => val === form.password, message: '两次输入的密码不一致' },
  ],
  agreed: [{ validator: (val: unknown) => Boolean(val), message: '请阅读并同意《用户协议》与《隐私政策》' }],
}

async function onSubmit() {
  if (closed.value) return
  submitting.value = true
  try {
    await auth.register({
      channel: 'username',
      username: form.username.trim(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      agreed: form.agreed,
    })
    notices.refreshUnread()
    Toast('注册成功，欢迎加入聚屿社区')
    markClean()
    const redirect = String(route.query.redirect ?? '/')
    await router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '注册失败，请稍后重试')
    void nextTick(() => formRef.value?.clearValidate(['username']))
  } finally {
    submitting.value = false
  }
}

function onRegisterSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) void onSubmit()
}
</script>

<template>
  <main id="main" class="page-fade-in m-register" tabindex="-1">
    <div class="hero">
      <h1 class="title">创建账号</h1>
      <p class="sub">用户名注册不支持验证码登录，也无法自助找回密码；建议改用登录页的手机号或邮箱方式。注册默认获得「个人用户」身份，昵称由系统自动分配。</p>
    </div>

    <NoticeBar v-if="closed" visible theme="warning" content="注册暂未开放，请稍后再试。" class="closed-tip" />

    <Form
      ref="formRef"
      class="form"
      :data="form"
      :rules="rules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onRegisterSubmit"
    >
      <FormItem label="用户名" name="username" help="字母开头，4-20 位，仅可包含字母、数字与下划线">
        <Input
          v-model="form.username"
          type="text"
          autocomplete="username"
          :maxlength="20"
          placeholder="请输入用户名…"
          :disabled="closed"
        />
      </FormItem>
      <FormItem label="密码" name="password" help="至少 8 位，需包含字母与数字">
        <PasswordInput
          class="password-field"
          v-model="form.password"
          autocomplete="new-password"
          placeholder="请输入密码…"
          :disabled="closed"
        />
      </FormItem>
      <FormItem label="确认密码" name="confirmPassword">
        <PasswordInput
          class="password-field"
          v-model="form.confirmPassword"
          autocomplete="new-password"
          placeholder="请再次输入密码…"
          :disabled="closed"
        />
      </FormItem>
      <FormItem name="agreed" class="agreement-item">
        <AgreementConsent v-model="form.agreed" :disabled="closed" />
      </FormItem>
      <Button theme="primary" size="large" block type="submit" :loading="submitting" :disabled="submitting || closed">
        {{ closed ? '注册暂未开放' : submitting ? '注册中…' : '注 册' }}
      </Button>
      <p class="swap">已有账号？<router-link :to="{ path: '/login', query: route.query.redirect ? { redirect: route.query.redirect } : {} }" class="link">直接登录</router-link></p>
    </Form>
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
  padding:calc(var(--app-space-9) + var(--app-space-8)) 0 var(--app-space-11);
}

.title {
  margin:0 0 var(--app-space-3);
  font: var(--app-type-page-title);
}

.sub {
  margin:0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.closed-tip {
  margin-bottom:var(--app-space-7);
}

/* t-form-item 默认左右布局 + 底部 hairline；本页沿用「标签在上」的既有版式 */
.form :deep(.t-form__item) {
  padding: 0;
  margin: 0 0 var(--app-space-7);
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

/* 字段帮助文案（如用户名/密码规则）：caption 档 + 次级文字色，与既有字段间距一致 */
.form :deep(.t-form__item-help) {
  margin-top: var(--app-space-3);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* 协议勾选：容器是 AgreementConsent（自带行布局与弹层），此处只管 FormItem 间距与占位 label */
.form :deep(.agreement-item) {
  margin: var(--app-space-2) 0 var(--app-space-7);
}

.form :deep(.agreement-item .t-form__label) {
  display: none;
}

.swap {
  margin:var(--app-space-9) 0 0;
  text-align: center;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
}
</style>
