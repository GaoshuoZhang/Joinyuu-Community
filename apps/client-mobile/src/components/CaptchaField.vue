<script setup lang="ts">
import { Button, Image, Input } from 'tdesign-mobile-vue'

/* 图形验证码输入行（登录/注册/找回密码/更换手机号共用）：输入框 + 可刷新验证码图片。 */
withDefaults(
  defineProps<{
    modelValue: string
    image?: string
    loading?: boolean
    disabled?: boolean
    label?: string
    error?: string
    clearable?: boolean
  }>(),
  { image: '', loading: false, disabled: false, label: '验证码', error: '', clearable: false },
)

const emit = defineEmits<{ 'update:modelValue': [string]; refresh: [] }>()
</script>

<template>
  <div class="field">
    <label>{{ label }}</label>
    <div class="captcha-row">
      <Input
        class="captcha-input"
        :model-value="modelValue"
        :maxlength="4"
        :spell-check="false"
        :clearable="clearable"
        :disabled="disabled"
        placeholder="请输入验证码…"
        @update:model-value="(value: string | number) => emit('update:modelValue', String(value))"
      />
      <Button
        class="captcha-button"
        theme="light"
        :disabled="loading || disabled"
        aria-label="刷新验证码"
        @click="emit('refresh')"
      >
        <Image v-if="image" :src="image" fit="contain" class="captcha-img" alt="图形验证码" />
        <span v-else>刷新</span>
      </Button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.captcha-row {
  display: flex;
  align-items: center;
  gap:var(--app-space-5);
}

.captcha-input {
  flex: 1;
  min-width: 0;
}

.captcha-button {
  flex-shrink: 0;
  min-width: 96px;
  min-height: 40px;
  padding:0;
  overflow: hidden;
}

.captcha-img {
  display: block;
  width: 96px;
  height: 40px;
}

.error {
  margin:var(--app-space-2) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}
</style>
