<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createAnnouncement, updateAnnouncement } from '@/api/announcements'
import type { Announcement } from '@/types'

/* 公告表单弹窗（创建即发布 / 编辑双模式共用）：
 * - create：标题 + 内容 + 置顶，确认后立即发布
 * - edit：编辑已有公告（不改状态与发布时间） */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  announcement: Announcement | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()

const form = reactive({
  title: '',
  content: '',
  pinned: false,
})

const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入公告标题', trigger: 'submit' }],
  content: [{ required: true, message: '请输入公告内容', trigger: 'submit' }],
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    if (props.mode === 'edit' && props.announcement) {
      form.title = props.announcement.title
      form.content = props.announcement.content
      form.pinned = props.announcement.pinned
    } else {
      form.title = ''
      form.content = ''
      form.pinned = false
    }
    nextTick(() => formRef.value?.clearValidate())
  },
)

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    if (props.mode === 'edit' && props.announcement) {
      await updateAnnouncement(props.announcement.id, { ...form })
      MessagePlugin.success('公告修改已保存')
    } else {
      const item = await createAnnouncement({ ...form })
      MessagePlugin.success(`公告已发布（${item.id}）`)
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="mode === 'edit' ? '编辑公告' : '发布公告'"
    width="640px"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'edit' ? '保存修改' : '确认发布' }}
        </t-button>
      </div>
    </template>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="公告标题" name="title">
        <t-input v-model="form.title" clearable placeholder="请输入公告标题" />
      </t-form-item>
      <t-form-item label="公告内容" name="content">
        <t-textarea
          v-model="form.content"
          :autosize="{ minRows: 6, maxRows: 12 }"
          placeholder="请输入公告内容（客户端公告位将完整展示）"
        />
      </t-form-item>
      <t-form-item label="置顶" name="pinned">
        <div class="pin-row">
          <t-switch v-model="form.pinned" />
          <span class="pin-tip">置顶公告在客户端公告位优先展示</span>
        </div>
      </t-form-item>
      <p v-if="mode === 'create'" class="publish-tip">确认后公告立即发布至客户端公告位，可随时下架或重新编辑。</p>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pin-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pin-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.publish-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
