<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createArticle, updateArticle } from '@/api/contents'
import { fetchColumns } from '@/api/contents'
import { fetchUserOptions } from '@/api/users'
import type { Article, ArticleColumn } from '@/types'

/* 文章创建/编辑弹窗：创建即草稿（status=draft），提交审核/审批走列表操作；
 * 编辑仅草稿/已驳回/已下架可用（列表侧控制入口）；
 * 作者身份快照取自所选用户当前身份（社区个体优先，其次个人用户） */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  article: Article | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
const columnOptions = ref<{ label: string; value: string }[]>([])
const userOptions = ref<{ label: string; value: string }[]>([])
const tagsText = ref('')

const form = reactive({
  title: '',
  columnId: '',
  authorId: '',
  summary: '',
})

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    if (props.mode === 'edit' && props.article) {
      form.title = props.article.title
      form.columnId = props.article.columnId
      form.authorId = props.article.authorId
      form.summary = props.article.summary
      tagsText.value = props.article.tags.join('，')
    } else {
      form.title = ''
      form.columnId = ''
      form.authorId = ''
      form.summary = ''
      tagsText.value = ''
    }
    if (columnOptions.value.length === 0 || userOptions.value.length === 0) {
      try {
        const [cols, opts] = await Promise.all([fetchColumns(), fetchUserOptions()])
        /* 仅启用栏目可选（停用栏目仅保留展示） */
        columnOptions.value = cols
          .filter((c: ArticleColumn) => c.status === 'enabled')
          .map((c) => ({ label: c.name, value: c.id }))
        userOptions.value = opts
      } catch {
        MessagePlugin.error('选项数据加载失败')
      }
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入文章标题', trigger: 'submit' }],
  columnId: [{ required: true, message: '请选择所属栏目', trigger: 'submit' }],
  authorId: [{ required: true, message: '请选择作者', trigger: 'submit' }],
  summary: [{ required: true, message: '请输入内容摘要', trigger: 'submit' }],
}

function parseTags(): string[] {
  return tagsText.value
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    const payload = {
      title: form.title,
      columnId: form.columnId,
      authorId: form.authorId,
      summary: form.summary,
      tags: parseTags(),
    }
    if (props.mode === 'create') {
      const article = await createArticle(payload)
      MessagePlugin.success(`文章已保存为草稿（${article.id}），可提交审核`)
    } else if (props.article) {
      await updateArticle(props.article.id, payload)
      MessagePlugin.success('文章修改已保存')
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
    :header="mode === 'create' ? '新建文章' : '编辑文章'"
    width="620px"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '保存草稿' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="文章标题" name="title">
        <t-input v-model="form.title" placeholder="请输入文章标题" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="所属栏目" name="columnId">
          <t-select v-model="form.columnId" :options="columnOptions" placeholder="仅启用栏目可选" />
        </t-form-item>
        <t-form-item label="作者" name="authorId">
          <t-select v-model="form.authorId" :options="userOptions" placeholder="选择社区用户" filterable />
        </t-form-item>
      </div>
      <t-form-item label="标签" name="tags">
        <t-input v-model="tagsText" placeholder="多个标签用逗号分隔" />
      </t-form-item>
      <t-form-item label="内容摘要" name="summary">
        <t-textarea
          v-model="form.summary"
          :autosize="{ minRows: 4, maxRows: 8 }"
          placeholder="文章摘要；正文内容 M1 接入富文本后支持"
        />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
