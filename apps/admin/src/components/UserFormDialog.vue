<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createUser } from '@/api/users'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import type { User } from '@/types'

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success', id: string): void
}>()

const formRef = ref()
const submitting = ref(false)
const form = reactive({
  username: '',
  nickname: '',
  phone: '',
  email: '',
  gender: 'male' as User['gender'],
  realName: '',
  citizenId: '',
  bio: '',
})
/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)

const rules: FormProps['rules'] = {
  /* 用户名选填：留空由服务端自动分配，仅填写时校验格式 */
  username: [
    {
      pattern: /^[A-Za-z][A-Za-z0-9_]{3,19}$/,
      message: '用户名需以字母开头，4-20 位，仅可包含字母、数字与下划线',
      trigger: 'submit',
    },
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'submit' }],
  phone: [{ required: true, message: '请输入联系电话', trigger: 'submit' }],
  email: [{ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确', trigger: 'submit' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'submit' }],
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.username = ''
    form.nickname = ''
    form.phone = ''
    form.email = ''
    form.gender = 'male'
    form.realName = ''
    form.citizenId = ''
    form.bio = ''
    markBaseline()
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 未保存保护：footer 取消 / X / Esc 均经 dirty guard 判断（有改动时确认后再关） */
function onClose() {
  guardClose(() => emit('update:visible', false))
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const result = await createUser({
      username: form.username.trim() || undefined,
      nickname: form.nickname.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      gender: form.gender,
      realName: form.realName.trim() || undefined,
      citizenId: form.citizenId.trim() || undefined,
      bio: form.bio.trim() || undefined,
    })
    MessagePlugin.success(`用户已新增（${result.id}）`)
    emit('update:visible', false)
    emit('success', result.id)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '新增失败')
  } finally {
    submitting.value = false
  }
}
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
</script>

<template>
  <t-dialog
    :visible="visible"
    header="新增用户"
    width="880px"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">确认新增</t-button>
      </div>
    </template>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="用户名" name="username">
        <t-input
          v-accessible-field
          v-model="form.username"
          clearable
          autocomplete="off"
          placeholder="留空由系统自动分配；字母开头 4-20 位，仅字母/数字/下划线…"
        />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="昵称" name="nickname">
          <t-input v-accessible-field v-model="form.nickname" clearable placeholder="请输入用户昵称…" />
        </t-form-item>
        <t-form-item label="性别" name="gender">
          <t-radio-group v-model="form.gender" variant="default-filled">
            <t-radio-button value="male">男</t-radio-button>
            <t-radio-button value="female">女</t-radio-button>
            <t-radio-button value="unknown">保密</t-radio-button>
          </t-radio-group>
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="联系电话" name="phone">
          <t-input v-accessible-field v-model="form.phone" clearable type="tel" inputmode="tel" autocomplete="tel" placeholder="请输入联系电话…" />
        </t-form-item>
        <t-form-item label="邮箱" name="email">
          <t-input v-accessible-field v-model="form.email" clearable inputmode="email" autocomplete="email" placeholder="选填，如 name@example.com…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="真实姓名" name="realName">
          <t-input v-accessible-field v-model="form.realName" clearable placeholder="选填…" />
        </t-form-item>
        <t-form-item label="身份证号" name="citizenId">
          <t-input v-accessible-field v-model="form.citizenId" clearable placeholder="选填…" />
        </t-form-item>
      </div>
      <t-form-item label="简介" name="bio">
        <t-textarea v-accessible-field v-model="form.bio" :autosize="{ minRows: 4, maxRows: 8 }" placeholder="选填…" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
