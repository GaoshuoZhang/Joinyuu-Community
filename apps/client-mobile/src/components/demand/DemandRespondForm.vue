<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button, Form, FormItem, Textarea, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import IdentityPicker from '@/components/forms/IdentityPicker.vue'
import { actionIdentityOptions } from '@/stores/auth'
import type { UserIdentity } from '@/types'

/* 响应需求表单：响应说明 + 单选响应身份（标签展示，默认第一个可选身份）；提交后由父级刷新并调用 clearNote。
 * v46：校验迁移 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const props = defineProps<{ identities: UserIdentity[]; userName: string; submitting: boolean }>()

const emit = defineEmits<{ respond: [note: string, identity: UserIdentity] }>()

const form = reactive({ note: '' })
const formRef = ref<FormInstanceFunctions>()
const identityOptions = computed(() => actionIdentityOptions(props.identities))
const picked = ref<UserIdentity | null>(identityOptions.value[0] ?? null)

/* v48：响应说明长度上限——取需求表单同类多行字段（期望交付 / 业务瓶颈等）的 500 字口径。
 * rules 不追加 max 规则：TDesign 的 max 按「中文 2 字符」计，与 maxlength 口径不一致，
 * 长度改由 Textarea 的 maxlength + indicator 直接约束（既有 rules 无长度限制，未新增业务限制）。 */
const NOTE_MAX_LENGTH = 500

const rules: FormRules<typeof form> = {
  note: [
    { required: true, message: '请输入响应说明' },
    { validator: (val: string) => !!val.trim(), message: '请输入响应说明' },
  ],
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
  emit('respond', form.note.trim(), picked.value)
}

function onSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) respond()
}

function clearNote() {
  form.note = ''
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
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.respond-form :deep(.t-form__controls) {
  margin: 0;
}

.identity-label {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.submit-btn {
  margin-top: 0;
}
</style>
