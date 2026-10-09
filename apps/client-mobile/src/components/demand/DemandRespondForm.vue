<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button, Form, FormItem, Input, Textarea, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import IdentityPicker from '@/components/forms/IdentityPicker.vue'
import { actionIdentityOptions } from '@/stores/auth'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { isPhone } from '@/utils/validators'
import type { DemandRespondPayload, UserIdentity } from '@/types'

/* 响应需求表单：响应说明（必填）+ 报价/工期/案例/手机（选填）+ 单选响应身份（标签展示，默认第一个可选身份）；
 * 提交后由父级刷新并调用 clearNote。 */
const props = defineProps<{ identities: UserIdentity[]; userName: string; submitting: boolean }>()

const emit = defineEmits<{ respond: [payload: DemandRespondPayload] }>()

const form = reactive({ note: '', quote: '', timeline: '', cases: '', phone: '' })
const formRef = ref<FormInstanceFunctions>()
/* 离开保护：任一字段有未提交内容时离开需确认；
 * 提交成功后父级调用 clearNote 清空，isDirty 自然归 false，不会误拦 */
useUnsavedGuard(() => Object.values(form).some((value) => value.trim().length > 0))
const identityOptions = computed(() => actionIdentityOptions(props.identities))
const picked = ref<UserIdentity | null>(identityOptions.value[0] ?? null)

/* 长度上限：取需求表单同类多行字段的 500 字口径；报价/工期/案例同理。
 * rules 不追加 max 规则：TDesign 的 max 按「中文 2 字符」计，与 maxlength 口径不一致，
 * 长度改由 Textarea 的 maxlength + indicator 直接约束（既有 rules 无长度限制，未新增业务限制）。 */
const NOTE_MAX_LENGTH = 500
const QUOTE_MAX_LENGTH = 64
const TIMELINE_MAX_LENGTH = 128
const CASES_MAX_LENGTH = 300
const PHONE_MAX_LENGTH = 11

const rules: FormRules<typeof form> = {
  note: [
    { required: true, message: '请输入响应说明' },
    { validator: (val: string) => !!val.trim(), message: '请输入响应说明' },
  ],
  /* 联系手机选填；填写时须为 11 位手机号（留空由服务端沿用账号手机号） */
  phone: [{ validator: (val: string) => !val.trim() || isPhone(val.trim()), message: '请输入正确的手机号' }],
}

watch(
  identityOptions,
  (list) => {
    if (!list.some((i) => i.type === picked.value?.type && i.enterpriseId === picked.value?.enterpriseId)) {
      picked.value = list[0] ?? null
    }
  },
  { deep: true },
)

function respond() {
  /* 身份区仅在有可选身份时渲染，无可选身份时由 Toast 提示 */
  if (!picked.value) {
    Toast('请选择响应身份')
    return
  }
  const optional = (value: string) => value.trim() || undefined
  emit('respond', {
    note: form.note.trim(),
    quote: optional(form.quote),
    timeline: optional(form.timeline),
    cases: optional(form.cases),
    phone: optional(form.phone),
    identity: picked.value,
  })
}

function onSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) respond()
}

function clearNote() {
  form.note = ''
  form.quote = ''
  form.timeline = ''
  form.cases = ''
  form.phone = ''
}

defineExpose({ clearNote })
</script>

<template>
  <Form
    ref="formRef"
    class="respond-form"
    :data="form"
    :rules="rules"
    label-align="top"
    scroll-to-first-error="smooth"
    @submit="onSubmit"
  >
    <FormItem label="响应说明" name="note">
      <Textarea
        v-model="form.note"
        :autosize="{ minRows: 3, maxRows: 6 }"
        :maxlength="NOTE_MAX_LENGTH"
        indicator
        placeholder="请说明你的方案、经验或可提供的资源…"
      />
    </FormItem>
    <!-- 短字段两列并排：报价 + 可投入时间；长文本整宽 -->
    <div class="short-fields">
      <FormItem label="报价 / 预算" name="quote">
        <Textarea
          v-model="form.quote"
          :autosize="{ minRows: 1, maxRows: 3 }"
          :maxlength="QUOTE_MAX_LENGTH"
          indicator
          placeholder="选填，如 3-5 万元…"
        />
      </FormItem>
      <FormItem label="可投入时间 / 预计工期" name="timeline">
        <Textarea
          v-model="form.timeline"
          :autosize="{ minRows: 1, maxRows: 3 }"
          :maxlength="TIMELINE_MAX_LENGTH"
          indicator
          placeholder="选填，如 2 周内可开工…"
        />
      </FormItem>
    </div>
    <FormItem label="相关经验与案例" name="cases">
      <Textarea
        v-model="form.cases"
        :autosize="{ minRows: 2, maxRows: 5 }"
        :maxlength="CASES_MAX_LENGTH"
        indicator
        placeholder="选填，可填写同类项目经验、案例或资源…"
      />
    </FormItem>
    <FormItem label="联系手机" name="phone">
      <Input
        v-model="form.phone"
        type="tel"
        inputmode="tel"
        :maxlength="PHONE_MAX_LENGTH"
        clearable
        placeholder="选填，默认使用账号手机号"
      />
    </FormItem>
    <div v-if="identityOptions.length" class="identity-field">
      <span class="identity-label">响应身份</span>
      <IdentityPicker
        :identities="identityOptions"
        :selected="picked?.type ?? ''"
        :selected-enterprise-id="picked?.enterpriseId ?? ''"
        :user-name="userName"
        @select="picked = $event"
      />
    </div>
    <!-- v48：与全仓其它长表单一致，主操作吸附在拇指区（.mobile-sticky-action 已含安全区处理），
         详情页较长时不会随内容滚出视口 -->
    <Button theme="primary" block class="submit-btn mobile-sticky-action" type="submit" :loading="submitting">响应需求</Button>
  </Form>
</template>

<style scoped>
.respond-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.short-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--app-space-5);
}

.identity-field {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

/* t-form-item 默认左右布局 + 底部 hairline；沿用「标签在上」的紧凑版式（与 .identity-label 同字号） */
.respond-form :deep(.t-form__item) {
  padding: 0;
  margin: 0;
  border-bottom: none;
}

.respond-form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.respond-form :deep(.t-form__controls) {
  margin: 0;
}

.identity-label {
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.submit-btn {
  margin-top: 0;
}
</style>
