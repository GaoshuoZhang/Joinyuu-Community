<script setup lang="ts">
import { reactive, watch } from 'vue'
import { Button, Input, Popup } from 'tdesign-mobile-vue'

/* 邀请企业成员弹层：姓名/手机号/职位校验后交由父级提交。 */
const props = defineProps<{ visible: boolean; submitting: boolean }>()
const emit = defineEmits<{
  'update:visible': [boolean]
  submit: [payload: { name: string; phone: string; role: string }]
}>()

const form = reactive({ name: '', phone: '', role: '' })
const errors = reactive({ name: '', phone: '', role: '' })

watch(() => form.name, () => (errors.name = ''))
watch(() => form.phone, () => (errors.phone = ''))
watch(() => form.role, () => (errors.role = ''))

watch(
  () => props.visible,
  (value) => {
    if (!value) return
    form.name = ''
    form.phone = ''
    form.role = ''
    errors.name = ''
    errors.phone = ''
    errors.role = ''
  },
)

function onSubmit() {
  errors.name = ''
  errors.phone = ''
  errors.role = ''
  if (!form.name.trim()) {
    errors.name = '请输入成员姓名'
    return
  }
  if (!/^1\d{10}$/.test(form.phone.trim())) {
    errors.phone = '请输入 11 位手机号'
    return
  }
  if (!form.role.trim()) {
    errors.role = '请输入成员职位'
    return
  }
  emit('submit', { name: form.name.trim(), phone: form.phone.trim(), role: form.role.trim() })
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
      <div class="field">
        <label>成员姓名</label>
        <Input v-model="form.name" autocomplete="off" :maxlength="20" placeholder="请输入成员姓名…" clearable />
        <p v-if="errors.name" class="field-error">{{ errors.name }}</p>
      </div>
      <div class="field">
        <label>手机号</label>
        <Input v-model="form.phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入 11 位手机号…" clearable />
        <p v-if="errors.phone" class="field-error">{{ errors.phone }}</p>
      </div>
      <div class="field">
        <label>职位</label>
        <Input v-model="form.role" autocomplete="off" :maxlength="20" placeholder="如：产品负责人 / 设计总监…" clearable />
        <p v-if="errors.role" class="field-error">{{ errors.role }}</p>
      </div>
      <Button theme="primary" size="large" block :loading="submitting" @click="onSubmit">
        {{ submitting ? '发送中…' : '发送邀请' }}
      </Button>
    </div>
  </Popup>
</template>

<style scoped>
.popup-body {
  box-sizing: border-box;
  width: 100%;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
}

.popup-title {
  margin: 0 0 var(--app-space-8);
  font-size: var(--app-font-title);
}

.field {
  margin-bottom:var(--app-space-8);
}

.field label {
  display: block;
  margin-bottom: var(--app-space-3);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}
</style>
