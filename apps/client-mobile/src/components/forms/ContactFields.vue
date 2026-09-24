<script setup lang="ts">
import { Input } from 'tdesign-mobile-vue'

/* 联系信息字段组：联系人 / 联系电话 / 联系邮箱（选填）。 */
defineProps<{
  name: string
  phone: string
  email: string
  nameError?: string
  phoneError?: string
  emailError?: string
}>()

defineEmits<{
  'update:name': [string]
  'update:phone': [string]
  'update:email': [string]
}>()
</script>

<template>
  <!-- data-field 供宿主表单定位首个出错字段（等价于 t-form 的 scroll-to-first-error） -->
  <div class="contact-fields">
    <div class="field" data-field="contactName">
      <label>联系人<span class="req"> *</span></label>
      <Input :model-value="name" :maxlength="20" placeholder="请输入联系人姓名…" clearable @update:model-value="(v: string | number) => $emit('update:name', String(v))" />
      <p v-if="nameError" class="field-error">{{ nameError }}</p>
    </div>
    <div class="field" data-field="contactPhone">
      <label>联系电话<span class="req"> *</span></label>
      <Input :model-value="phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入 11 位手机号…" clearable @update:model-value="(v: string | number) => $emit('update:phone', String(v))" />
      <p v-if="phoneError" class="field-error">{{ phoneError }}</p>
    </div>
    <div class="field" data-field="contactEmail">
      <label>联系邮箱（选填）</label>
      <Input :model-value="email" name="contact-email" inputmode="email" autocomplete="email" :spell-check="false" :maxlength="60" placeholder="便于对方直接邮件联系…" clearable @update:model-value="(v: string | number) => $emit('update:email', String(v))" />
      <p v-if="emailError" class="field-error">{{ emailError }}</p>
    </div>
  </div>
</template>

<style scoped>
.contact-fields {
  display: flex;
  flex-direction: column;
}

.field {
  margin-bottom: var(--app-space-8);
}

.field label {
  display: block;
  font: var(--app-type-body);
  margin-bottom: var(--app-space-4);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

/* 必填标识（与 SchemaField 的 .req 同口径） */
.req {
  color: var(--td-error-color);
}
</style>
