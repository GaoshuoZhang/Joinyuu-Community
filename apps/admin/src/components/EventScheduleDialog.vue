<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin, type FormProps } from 'tdesign-vue-next'
import { scheduleEvent } from '@/api/events'
import type { CommunityEvent } from '@/types'

/* 定时发布对话框：待发布活动设定定时发布时间，保存后转为「定时发布中」，到点自动发布。
 * 底部按钮（从左到右）：取消 / 定时发布 */
const props = defineProps<{
  visible: boolean
  event: CommunityEvent | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const form = reactive({ scheduledAt: '' })
const rules: FormProps['rules'] = {
  scheduledAt: [{ required: true, message: '请选择定时发布时间', trigger: 'submit' }],
}
const submitting = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    form.scheduledAt = ''
    nextTick(() => formRef.value?.clearValidate())
  },
)

const formRef = ref()

async function onConfirm() {
  if (!props.event) return
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    await scheduleEvent(props.event.id, form.scheduledAt)
    MessagePlugin.success(`已设定定时发布，将于 ${form.scheduledAt} 自动发布`)
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="定时发布"
    width="480px"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    @close="onCancel"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onCancel">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">定时发布</t-button>
      </div>
    </template>

    <p class="dialog-tip">
      为「{{ event?.title }}」设定定时发布时间，到点自动上架并开放报名。
    </p>
    <t-form
      ref="formRef"
      :data="form"
      :rules="rules"
      label-align="top"
    >
      <t-form-item label="定时发布时间" name="scheduledAt">
        <t-date-picker
          v-model="form.scheduledAt"
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
  font-size: 12px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}
</style>
