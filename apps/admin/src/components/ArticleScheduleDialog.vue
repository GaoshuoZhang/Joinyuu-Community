<script setup lang="ts">
import { useDialogFormProtection, focusFirstInvalid } from '@/utils/form'
import { computed, nextTick, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { scheduleArticle } from '@/api/contents'
import type { Article } from '@/types'

/* 文章定时发布对话框：待发布文章设定发布时间，保存后转为「定时发布中」。
 * 底部按钮（从左到右）：取消 / 定时发布 */
const props = defineProps<{
  visible: boolean
  article: Article | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const scheduledAt = ref('')
const submitting = ref(false)
const formRef = ref()

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    scheduledAt.value = ''
    nextTick(() => formRef.value?.clearValidate())
  },
)

async function onConfirm() {
  if (!props.article) return
  const valid = await formRef.value?.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    await scheduleArticle(props.article.id, scheduledAt.value)
    MessagePlugin.success(`已设定定时发布，将于 ${scheduledAt.value} 自动发布`)
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onCancel() {
  closeProtected()
}
function finishClose() {
  emit('update:visible', false)
}
const protectedVisible = computed({ get: () => props.visible, set: () => finishClose() })
const { close: closeProtected } = useDialogFormProtection(() => scheduledAt.value, protectedVisible, computed(() => !!submitting.value))
</script>

<template>
  <!-- 已输入的发布时间受到未保存保护，关闭前可选择继续编辑。 -->
  <t-dialog :visible="visible" header="定时发布" width="480px" :close-on-overlay-click="false" :close-on-esc-keydown="true" @close="onCancel">
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onCancel">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">定时发布</t-button>
      </div>
    </template>

    <p class="dialog-tip">为「{{ article?.title }}」设定定时发布时间，到点自动发布上架。</p>
    <t-form
      ref="formRef"
      :data="{ scheduledAt }"
      :rules="{ scheduledAt: [{ required: true, message: '请选择定时发布时间', trigger: 'submit' }] }"
      label-align="top"
    >
      <t-form-item label="定时发布时间" name="scheduledAt">
        <t-date-picker
          v-accessible-field
          v-model="scheduledAt"
          valueType="YYYY-MM-DD HH:mm"
          enable-time-picker
          placeholder="到点自动发布…"
          class="ctl-w-full"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>

.dialog-tip {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}
</style>
