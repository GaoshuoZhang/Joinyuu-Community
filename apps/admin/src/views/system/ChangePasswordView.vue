<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import PageHeader from '@/components/PageHeader.vue'
import { changePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

/* 修改密码：原密码校验 + 新密码强度；改密后强制重登 */

const router = useRouter()
const auth = useAuthStore()

const formRef = ref()
const saving = ref(false)
const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirm: '',
})

const rules: FormProps['rules'] = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'submit' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'submit' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: '至少 8 位，且包含字母与数字', trigger: 'submit' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'submit' },
    {
      validator: (val: string) => val === form.newPassword,
      message: '两次输入的密码不一致',
      trigger: 'submit',
    },
  ],
}

async function onSubmit() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  saving.value = true
  try {
    await changePassword(form.oldPassword, form.newPassword)
    MessagePlugin.success('密码已修改，请使用新密码重新登录')
    /* 改密会黑名单当前 token；此处直接登出回登录页 */
    await auth.logout().catch(() => undefined)
    router.push('/login')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '修改失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="change-password page-fade-in">
    <PageHeader title="修改密码" description="定期更新登录密码，提升账号安全性" />

    <div class="page-card form-card">
      <t-form ref="formRef" :data="form" :rules="rules" label-align="left" label-width="90px" @submit="onSubmit">
        <t-form-item label="原密码" name="oldPassword">
          <t-input v-model="form.oldPassword" type="password" name="current-password" autocomplete="current-password" placeholder="当前登录密码…" style="width: 320px" />
        </t-form-item>
        <t-form-item label="新密码" name="newPassword">
          <t-input v-model="form.newPassword" type="password" name="new-password" autocomplete="new-password" placeholder="至少 8 位，包含字母与数字…" style="width: 320px" />
        </t-form-item>
        <t-form-item label="确认新密码" name="confirm">
          <t-input v-model="form.confirm" type="password" name="confirm-password" autocomplete="new-password" placeholder="再次输入新密码…" style="width: 320px" />
        </t-form-item>
        <t-form-item>
          <t-button theme="primary" type="submit" :loading="saving">确认修改</t-button>
          <t-button variant="outline" @click="router.back()">返回</t-button>
        </t-form-item>
      </t-form>
    </div>
  </div>
</template>

<style scoped>
.form-card {
  max-width: 560px;
}
</style>
