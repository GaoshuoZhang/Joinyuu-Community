<script setup lang="ts">
import { reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { withdrawArticle } from '@/api/contents'
import { retractDemand } from '@/api/demands'

const emit = defineEmits<{ (e: 'success'): void }>()
const visible = ref(false)
const submitting = ref(false)
const target = ref<{ type: 'article' | 'demand'; id: string; title: string } | null>(null)
const form = reactive({ takedownReason: '' })

function open(type: 'article' | 'demand', row: { id: string; title: string }) {
  target.value = { type, id: row.id, title: row.title }
  form.takedownReason = ''
  visible.value = true
}

async function submit() {
  if (!target.value || submitting.value) return
  submitting.value = true
  try {
    const { type, id } = target.value
    const reason = form.takedownReason.trim()
    if (type === 'article') await withdrawArticle(id, reason)
    else await retractDemand(id, reason)
    MessagePlugin.success(type === 'article' ? '文章已下架并关闭' : '已下架，内容转为待发布')
    visible.value = false
    emit('success')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '下架失败')
  } finally {
    submitting.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <t-dialog v-model:visible="visible" header="下架内容" width="520px" :close-on-overlay-click="false">
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="visible = false">取消</t-button>
        <t-button theme="danger" :loading="submitting" @click="submit">确认下架</t-button>
      </div>
    </template>
    <p>确认下架「{{ target?.title }}」？{{ target?.type === 'article' ? '下架后状态为已关闭。' : '下架后转为待发布。' }}</p>
    <t-form :data="form" label-align="top">
      <t-form-item label="下架理由（选填）" name="takedownReason">
        <t-textarea v-model="form.takedownReason" :maxlength="255" placeholder="填写后将通过站内信通知内容所属用户；留空不通知…" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>
