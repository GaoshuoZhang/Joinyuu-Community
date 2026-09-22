<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
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
  if (valid !== true) return
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
  emit('update:visible', false)
}
</script>

<template>
  <!-- 无脏数据（每次打开重置），允许 ESC 关闭；遮罩点击策略与同批调度类弹窗一致（不关闭） -->
  <t-dialog :visible="visible" header="定时发布" width="480px" :close-on-overlay-click="false" :close-on-esc-keydown="true" @close="onCancel">
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onCancel">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">定时发布</t-button>
      </div>
    </template>

    <p class="dialog-tip">为「{{ article?.title }}」设定定时发布时间，到点自动发布上架。留空则取消本次操作。</p>
    <t-form
      ref="formRef"
      :data="{ scheduledAt }"
      :rules="{ scheduledAt: [{ required: true, message: '请选择定时发布时间', trigger: 'submit' }] }"
      label-align="top"
    >
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

.dialog-tip {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}
</style>
