<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import { createArticle, fetchArticleColumns, updateArticle, updateSubmissionArticle } from '@/api/contents'
import { fetchPublisherOptions } from '@/api/demands'
import type { Article, ArticleChannel } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 文章新增/编辑弹窗（资讯发布与投稿编辑共用）：
 * - channel=official（资讯发布）：新增即「待发布」；作者可选，选项同「新增需求」的需求方（注册个人用户/企业）
 * - channel=submitted（投稿内容）：仅「待发布」态可编辑，作者只读展示
 * 操作项仅「取消」「保存」；校验必填：标题 / 栏目（单选）/ 摘要 / 正文 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  article: Article | null
  channel: ArticleChannel
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
const columnOptions = ref<{ label: string; value: string }[]>([])
const tagsText = ref('')

/* 作者选项（仅资讯发布）：选项与「新增需求」的需求方一致（注册个人用户/企业） */
const publisherUsers = ref<{ uid: string; nickname: string; tag: string }[]>([])
const publisherEnterprises = ref<{ id: string; name: string; tag: string }[]>([])
const authorOptions = ref<{ label: string; value: string }[]>([])

/* 选项加载失败：内联提示 + 重新加载（替代仅 toast，与 LeaseFormDialog/WorkstationFormDialog 同构） */
const columnLoadError = ref('')
const publisherLoadError = ref('')

async function loadColumnOptions() {
  try {
    columnOptions.value = (await fetchArticleColumns()).map((c) => ({ label: c.name, value: c.id }))
    columnLoadError.value = ''
  } catch (e) {
    columnLoadError.value = e instanceof Error ? e.message : '栏目选项加载失败'
  }
}

async function loadAuthorOptions() {
  if (props.channel !== 'official' || publisherUsers.value.length > 0) return
  try {
    const opts = await fetchPublisherOptions()
    publisherUsers.value = opts.users
    publisherEnterprises.value = opts.enterprises
    authorOptions.value = [
      ...opts.enterprises.map((e) => ({ label: `${e.name}（${e.tag} · ${e.id}）`, value: `E:${e.id}` })),
      ...opts.users.map((u) => ({ label: `${u.nickname}（${u.tag} · ${u.uid}）`, value: `U:${u.uid}` })),
    ]
    publisherLoadError.value = ''
  } catch (e) {
    publisherLoadError.value = e instanceof Error ? e.message : '作者选项加载失败'
  }
}

const form = reactive({
  title: '',
  columnId: '',
  summary: '',
  content: '',
  commentsEnabled: true,
  /** 作者选中值（U:uid / E:id，空 = 未选） */
  authorValue: '',
})

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(() => ({
  ...form, tags: tagsText.value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
}))

function resetForm() {
  if (props.mode === 'edit' && props.article) {
    form.title = props.article.title
    /* 栏目单选：取首个栏目（契约仍为 columnIds 数组承载） */
    form.columnId = props.article.columnIds[0] ?? ''
    form.summary = props.article.summary
    form.content = props.article.content ?? ''
    form.commentsEnabled = props.article.commentsEnabled ?? true
    tagsText.value = props.article.tags.join('，')
    form.authorValue = resolveAuthorValue(props.article.authorId)
  } else {
    form.title = ''
    form.columnId = ''
    form.summary = ''
    form.content = ''
    form.commentsEnabled = true
    tagsText.value = ''
    form.authorValue = ''
  }
}

/* 由 authorId 反查选项值（U:uid 优先，其次 E:id），编辑回显用 */
function resolveAuthorValue(authorId?: string): string {
  if (!authorId) return ''
  if (publisherUsers.value.some((u) => u.uid === authorId)) return `U:${authorId}`
  if (publisherEnterprises.value.some((e) => e.id === authorId)) return `E:${authorId}`
  return authorId.startsWith('U') ? `U:${authorId}` : `E:${authorId}`
}

/* 投稿只读作者展示：名称-ID（投稿人 UID / 企业 ID，保证唯一性） */
function readonlyAuthorLabel(article: Article): string {
  return article.authorId ? `${article.authorName}-${article.authorId}` : article.authorName
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    resetForm()
    if (columnOptions.value.length === 0) await loadColumnOptions()
    if (props.channel === 'official' && publisherUsers.value.length === 0) await loadAuthorOptions()
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    markBaseline()
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入文章标题', trigger: 'submit' }],
  columnId: [{ required: true, message: '请选择栏目', trigger: 'submit' }],
  summary: [{ required: true, message: '请输入内容摘要', trigger: 'submit' }],
  content: [{ required: true, message: '请输入正文内容', trigger: 'submit' }],
}

function parseTags(): string[] {
  return tagsText.value
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/* 作者选中值（U:uid / E:id）→ authorId；未选为 undefined */
function authorIdFromValue(): string | undefined {
  const v = form.authorValue
  if (!v) return undefined
  return v.includes(':') ? v.slice(2) : v
}

/* 作者展示名：未选作者默认「社区运营」；选中时取选项名（'（' 前部分）。
 * 编辑时若作者不在选项列表（历史数据），保留原作者名，不重置为社区运营 */
function channelAuthorName(): string | undefined {
  if (props.channel !== 'official') return undefined
  if (!form.authorValue) {
    return props.mode === 'edit' ? props.article?.authorName : '社区运营'
  }
  const opt = authorOptions.value.find((o) => o.value === form.authorValue)
  return opt ? opt.label.split('（')[0] || undefined : undefined
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload = {
      title: form.title.trim(),
      /* 栏目单选 → 契约数组承载单元素 */
      columnIds: form.columnId ? [form.columnId] : [],
      summary: form.summary.trim(),
      content: form.content,
      tags: parseTags(),
      commentsEnabled: form.commentsEnabled,
      /* 资讯发布作者可选；投稿编辑作者不可变更。
       * 编辑时原作者不在选项列表则保留原 authorId，避免静默丢失归属 */
      authorId:
        props.channel === 'official'
          ? authorIdFromValue() ?? (props.mode === 'edit' ? props.article?.authorId : undefined)
          : props.article?.authorId,
      authorName: channelAuthorName() ?? props.article?.authorName,
    }
    if (props.mode === 'create') {
      const item = await createArticle(payload, props.channel)
      MessagePlugin.success(
        props.channel === 'official' ? `资讯已保存为待发布（${item.id}）` : `投稿已新增（${item.id}）`,
      )
    } else if (props.article) {
      if (props.channel === 'submitted') {
        await updateSubmissionArticle(props.article.id, payload)
      } else {
        await updateArticle(props.article.id, payload)
      }
      MessagePlugin.success('修改已保存')
    }
    emit('update:visible', false)
    emit('success')
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
    :header="mode === 'create' ? (channel === 'official' ? '发布资讯' : '新增投稿') : '编辑文章'"
    width="880px"
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
      <!-- 选项加载失败：内联提示 + 重新加载（失败不阻塞其余字段填写） -->
      <t-alert v-if="columnLoadError" theme="error" style="margin-bottom: 12px">
        <div class="error-retry-line">{{ columnLoadError }}
          <t-button size="small" variant="text" theme="primary" @click="loadColumnOptions">重新加载</t-button>
        </div>
      </t-alert>
      <t-alert v-if="channel === 'official' && publisherLoadError" theme="error" style="margin-bottom: 12px">
        <div class="error-retry-line">{{ publisherLoadError }}
          <t-button size="small" variant="text" theme="primary" @click="loadAuthorOptions">重新加载</t-button>
        </div>
      </t-alert>
      <t-form-item label="文章标题" name="title">
        <t-input v-accessible-field v-model="form.title" clearable placeholder="请输入文章标题…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="所属栏目" name="columnId">
          <t-select v-accessible-field v-model="form.columnId" clearable :options="columnOptions" placeholder="选择栏目…" />
        </t-form-item>
        <t-form-item v-if="channel === 'official'" label="作者" name="authorValue">
          <t-select
            v-accessible-field
            v-model="form.authorValue"
            :options="authorOptions"
            filterable
            clearable
            placeholder="选择已注册的个人用户/企业…"
          />
        </t-form-item>
        <t-form-item v-else-if="channel === 'submitted' && article" label="作者">
          <t-input v-accessible-field :value="readonlyAuthorLabel(article)" disabled />
        </t-form-item>
      </div>
      <t-form-item label="内容摘要" name="summary">
        <t-textarea
          v-accessible-field
          v-model="form.summary"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="文章摘要，列表与客户端卡片展示用…"
        />
      </t-form-item>
      <t-form-item label="正文内容" name="content">
        <RichEditor v-accessible-field v-model="form.content" placeholder="请输入正文内容，支持图文排版…" :min-height="320" />
      </t-form-item>
      <t-form-item label="标签" name="tags">
        <t-input v-accessible-field v-model="tagsText" placeholder="多个标签用逗号分隔…" />
      </t-form-item>
      <t-form-item label="评论功能" name="commentsEnabled">
        <t-switch v-accessible-field v-model="form.commentsEnabled" />
        <span class="switch-tip">关闭后成员端不展示评论，也不接受评论读取或发布。</span>
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

/* 选项加载失败行：错误文案与「重新加载」按钮同行 */
.error-retry-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.switch-tip {
  margin-left: 8px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
</style>
