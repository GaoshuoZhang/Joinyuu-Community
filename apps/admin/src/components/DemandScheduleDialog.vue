<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { scheduleDemand } from '@/api/demands'
import type { Demand } from '@/types'

/* 定时发布对话框：待发布需求设定定时发布时间，保存后转为「定时发布中」，到点自动发布。
 * 底部按钮（从左到右）：取消 / 定时发布 */
const props = defineProps<{
  visible: boolean
  demand: Demand | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const scheduledAt = ref('')
const submitting = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    scheduledAt.value = ''
  },
)

async function onConfirm() {
  if (!props.demand) return
  if (!scheduledAt.value) {
    MessagePlugin.warning('请选择定时发布时间')
    return
  }
  submitting.value = true
  try {
    await scheduleDemand(props.demand.id, scheduledAt.value)
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
  emit('update:visible', false)
}

/* 打开后聚焦时间选择，确保点选面板不触发外层红框 */
watch(
  () => props.visible,
  () => nextTick(() => formRef.value?.clearValidate()),
)

const formRef = ref()
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
      为「{{ demand?.title }}」设定定时发布时间，到点自动上架需求广场。留空则取消本次操作。
    </p>
    <t-form ref="formRef" :rules="{ scheduledAt: [{ required: true, message: '请选择定时发布时间', trigger: 'submit' }] }" label-align="top">
      <t-form-item label="定时发布时间" name="scheduledAt">
        <t-date-picker
          v-model="scheduledAt"
          valueType="YYYY-MM-DD HH:mm"
          enable-time-picker
          placeholder="到点自动发布…"
          style="width: 100%"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}
</style>
