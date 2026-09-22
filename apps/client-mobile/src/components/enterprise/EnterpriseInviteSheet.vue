<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { Button, Form, FormItem, Input, Popup } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { isPhone } from '@/utils/validators'

/* 邀请企业成员弹层：姓名/手机号/职位校验后交由父级提交。
 * v46：校验迁移 t-form/rules——错误内联在字段下方，重新打开时清空上一轮校验状态。 */
const props = defineProps<{ visible: boolean; submitting: boolean }>()
const emit = defineEmits<{
  'update:visible': [boolean]
  submit: [payload: { name: string; phone: string; role: string }]
}>()

const form = reactive({ name: '', phone: '', role: '' })
const formRef = ref<FormInstanceFunctions>()

const rules: FormRules<typeof form> = {
  name: [{ required: true, message: '请输入成员姓名' }],
  phone: [
    { required: true, message: '请输入 11 位手机号' },
    { validator: (val: string) => !val.trim() || isPhone(val), message: '请输入 11 位手机号' },
  ],
  role: [{ required: true, message: '请输入成员职位' }],
}

watch(
  () => props.visible,
  (value) => {
    if (!value) return
    form.name = ''
    form.phone = ''
    form.role = ''
    /* 重新打开时清空上一轮的校验状态，避免残留错误提示 */
    void nextTick(() => formRef.value?.clearValidate())
  },
)

function onInviteSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) emit('submit', { name: form.name.trim(), phone: form.phone.trim(), role: form.role.trim() })
}
</script>

<template>
  <Popup
    :visible="visible"
    placement="bottom"
    :close-btn="true"
    @update:visible="(value: boolean) => emit('update:visible', value)"
  >
    <div class="popup-body">
      <h3 class="popup-title">邀请企业成员</h3>
      <Form
        ref="formRef"
        class="invite-form"
        :data="form"
        :rules="rules"
        label-align="top"
        scroll-to-first-error="smooth"
        @submit="onInviteSubmit"
      >
        <FormItem label="成员姓名" name="name">
          <Input v-model="form.name" autocomplete="off" :maxlength="20" placeholder="请输入成员姓名…" clearable />
        </FormItem>
        <FormItem label="手机号" name="phone">
          <Input v-model="form.phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入 11 位手机号…" clearable />
        </FormItem>
        <FormItem label="职位" name="role">
          <Input v-model="form.role" autocomplete="off" :maxlength="20" placeholder="如：产品负责人 / 设计总监…" clearable />
        </FormItem>
        <Button theme="primary" size="large" block type="submit" :loading="submitting">
          {{ submitting ? '发送中…' : '发送邀请' }}
        </Button>
      </Form>
    </div>
  </Popup>
</template>

<style scoped>
.popup-body {
  box-sizing: border-box;
  width: 100%;
  /* v46：内距改用间距 token 表达（原裸 px 20/16），安全区仍单独叠加 */
  padding: var(--app-space-9) var(--app-space-8) calc(var(--app-space-9) + env(safe-area-inset-bottom));
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
}

.popup-title {
  margin: 0 0 var(--app-space-8);
  font-size: var(--app-font-title);
}

/* t-form-item 默认左右布局 + 底部 hairline；弹窗内沿用「标签在上」的紧凑版式 */
.invite-form :deep(.t-form__item) {
  padding: 0;
  margin: 0 0 var(--app-space-8);
  border-bottom: none;
}

.invite-form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.invite-form :deep(.t-form__controls) {
  margin: 0;
}
</style>
