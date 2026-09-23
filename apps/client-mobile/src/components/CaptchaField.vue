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
    clearable?: boolean
  }>(),
  { image: '', loading: false, disabled: false, label: '验证码', clearable: false },
)

const emit = defineEmits<{ 'update:modelValue': [string]; refresh: [] }>()
</script>

<template>
  <div class="field">
    <!-- 验证码在各宿主页面均为必填，且宿主通常隐藏 FormItem 自带 label（由本组件标签承担），
         故必填星号在此统一渲染 -->
    <label>{{ label }}<span class="req"> *</span></label>
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
  </div>
</template>

<style scoped>
/* v48：TDesign 的 .t-form__controls-content 是 flex 容器，本组件作为 flex item 默认收缩为
 * 内容宽，导致验证码图片右边缘比输入框/主按钮短一截（不右对齐）。显式撑满可用宽度。 */
.field {
  width: 100%;
  min-width: 0;
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.req {
  color: var(--td-error-color);
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
  /* 官方按钮自带左右内距（--td-button-medium-padding-horizontal 默认 16px），会把 96px 宽的
   * 验证码图挤到按钮中间，视觉上不右对齐（也与输入框右边缘错位）。用官方变量置零即可让图片
   * 铺满按钮并与表单右边缘对齐；不要用 padding 覆盖，同权重会被库样式按加载顺序盖掉。 */
  --td-button-medium-padding-horizontal: 0;
  min-width: 96px;
  overflow: hidden;
}

.captcha-img {
  display: block;
  width: 96px;
  height: 40px;
}
</style>
