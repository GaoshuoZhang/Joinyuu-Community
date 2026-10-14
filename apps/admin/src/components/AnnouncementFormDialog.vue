<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import { createAnnouncement, updateAnnouncement } from '@/api/announcements'
import type { Announcement } from '@/types'

/* 公告新增/编辑弹窗（严格对齐后端 AnnouncementPayloadDto：title/content/pinned/expireAt/link）。
 * 「启用」开关不在此处：启用需走列表的互锁二次确认，编辑态沿用该条既有启用状态。 */
const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  announcement: Announcement | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'saved'): void
}>()

const submitting = ref(false)
const formRef = ref()

const form = reactive({
  title: '',
  content: '',
  expireAt: '',
  link: '',
})

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)

function resetForm() {
  if (props.mode === 'edit' && props.announcement) {
    form.title = props.announcement.title
    form.content = props.announcement.content
    form.expireAt = props.announcement.expireAt ?? ''
    form.link = props.announcement.link ?? ''
  } else {
    form.title = ''
    form.content = ''
    form.expireAt = ''
    form.link = ''
  }
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    resetForm()
    markBaseline()
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入公告标题', trigger: 'submit' }],
  content: [{ required: true, message: '请输入公告内容', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload = {
      title: form.title.trim(),
      content: form.content,
      /* 新增默认不启用；编辑保持该条既有启用状态（启用只在列表开关上变更） */
      pinned: props.mode === 'edit' ? Boolean(props.announcement?.pinned) : false,
      expireAt: form.expireAt || undefined,
      link: form.link.trim() || undefined,
    }
    if (props.mode === 'create') {
      const item = await createAnnouncement(payload)
      MessagePlugin.success(`公告已新增（${item.id}），可在列表启用`)
    } else if (props.announcement) {
      await updateAnnouncement(props.announcement.id, payload)
      MessagePlugin.success('公告修改已保存')
    }
    emit('update:visible', false)
    emit('saved')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  /* 未保存保护：有改动时弹确认（见 useDialogDirtyGuard） */
  guardClose(() => emit('update:visible', false))
}
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
</script>

<template>
  <t-dialog
    lazy
    destroy-on-close
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'create' ? '新增公告' : '编辑公告'"
    width="760px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">保存</t-button>
      </div>
    </template>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="公告标题" name="title">
        <t-input v-accessible-field v-model="form.title" clearable :maxlength="128" placeholder="请输入公告标题…" />
      </t-form-item>
      <t-form-item label="公告内容" name="content">
        <RichEditor v-accessible-field v-model="form.content" placeholder="请输入公告内容，支持图文排版…" :min-height="320" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="有效期" name="expireAt">
          <t-date-picker
            v-accessible-field
            v-model="form.expireAt"
            value-type="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            placeholder="留空表示长期有效…"
            class="ctl-w-full"
          />
        </t-form-item>
        <t-form-item label="跳转链接" name="link">
          <t-input v-accessible-field v-model="form.link" clearable :maxlength="128" placeholder="站内路径，如 /plaza?tab=events…" />
        </t-form-item>
      </div>
      <p class="form-tip">启用开关在公告列表中操作：启用后将自动关闭其它公告，客户端首页仅展示启用的一条。</p>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.form-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
