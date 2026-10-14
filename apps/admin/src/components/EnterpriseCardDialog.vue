<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import ImageUploadField from '@/components/ImageUploadField.vue'
import { cardFields, updateCard, type CardRow } from '@/api/cards'
import { useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'

/* 编辑企业名片弹窗（企业详情 > 名片标签页）：
 * 字段集与名片字段定义一致，Logo 走图片上传（回填素材 URL），其余文本字段按配置渲染。 */
const props = defineProps<{
  visible: boolean
  enterpriseId: string
  /** 当前名片（详情页已加载），打开时作为表单初值 */
  card: CardRow | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const form = reactive<Record<string, string>>({})
/* Logo 单独用图片上传控件渲染，其余文本字段按字段定义渲染 */
const textFields = cardFields.enterprise.filter((field) => field.key !== 'logo')
const longTextFields = ['intro', 'description', 'industryExperience', 'services', 'advantages']
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)

/* 打开即从当前名片回填（数组字段以「、」拼接，保存时服务端再拆分） */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    for (const field of cardFields.enterprise) {
      const value = props.card?.[field.key as keyof CardRow]
      form[field.key] = Array.isArray(value) ? value.join('、') : String(value ?? '')
    }
    markBaseline()
  },
)

async function submit() {
  if (submitting.value) return
  const payload: Record<string, string> = Object.fromEntries(
    cardFields.enterprise.map((field) => [field.key, form[field.key]?.trim() ?? '']),
  )
  submitting.value = true
  try {
    await updateCard('enterprise', props.enterpriseId, payload)
    emit('update:visible', false)
    MessagePlugin.success('企业名片已更新')
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
function onClose() {
  guardClose(() => emit('update:visible', false))
}
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
</script>

<template>
  <t-dialog
    :visible="visible"
    header="编辑企业名片"
    width="720px"
    :confirm-btn="{ content: '保存名片', loading: submitting }"
    @confirm="submit"
    @close="onClose"
  >
    <t-form :data="form" label-align="top">
      <t-form-item label="企业 Logo" name="logo">
        <ImageUploadField
          v-model="form.logo"
          biz-type="enterprise-logo"
          tip="选择本地图片即上传并替换（建议 1:1 方图）；上传后展示在企业名片与展示页"
        />
      </t-form-item>
      <t-form-item v-for="field in textFields" :key="field.key" :label="field.label" :name="field.key">
        <t-textarea
          v-accessible-field
          v-if="longTextFields.includes(field.key)"
          v-model="form[field.key]"
          :name="field.key"
          :placeholder="`${field.label}…`"
          :maxlength="500"
        />
        <t-input v-accessible-field v-else v-model="form[field.key]" :name="field.key" :placeholder="`${field.label}…`" :maxlength="255" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>
