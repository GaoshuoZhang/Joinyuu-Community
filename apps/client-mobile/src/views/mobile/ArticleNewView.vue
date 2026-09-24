<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, CheckTag, DialogPlugin, Icon, Image, Input, Textarea, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { createArticle, fetchColumns, fetchMyArticlePayload, resubmitArticle } from '@/api/contents'
import { fetchMyIdentities } from '@/api/enterprises'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'
import FlowResult from '@/components/FlowResult.vue'
import { actionIdentityOptions, identityOptionLabel, useAuthStore } from '@/stores/auth'
import type { ArticleColumn, IdentityType, UserIdentity } from '@/types'
import {
  articleInsertionAnchor,
  articleVisibleTextLength,
  moveArticleContentBlock,
  parseArticleContent,
  resolveArticleInsertionIndex,
  serializeArticleContent,
  type ArticleContentBlock,
  type ArticleInsertionAnchor,
} from '@/utils/articleContent'
import { formatZhNumber } from '@/utils/format'

const MIN_CONTENT = 30
const router = useRouter()
const route = useRoute()
/** v34 修改重提：携带 ?revise=<投稿 id> 进入本页 */
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)
const auth = useAuthStore()
const { data: columnData, loading: columnsLoading, error: columnsError, run: loadColumns } = useAsyncList<ArticleColumn[]>(
  () => fetchColumns({ submission: true }),
)
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities
  const extra = delegatedIdentities.value.filter(
    (delegated) => !base.some((identity) => identity.type === 'community_enterprise' && identity.enterpriseId === delegated.enterpriseId),
  )
  return actionIdentityOptions([...base, ...extra])
})
const form = reactive({ title: '', columnCode: '', asIdentity: '' as IdentityType | '', asEnterpriseId: '' })
/* v40：投稿校验行内错误（与 Toast 并存，错误可随修改清除） */
const errors = reactive({ title: '', column: '', identity: '', content: '' })
watch(() => form.title, () => (errors.title = ''))
watch(() => form.columnCode, () => (errors.column = ''))
watch(() => form.asIdentity, () => (errors.identity = ''))
const coverFiles = ref<UploadFile[]>([])
/* 封面以 Upload 的 files 为唯一来源（修改重提时用已有封面地址回显，用户可见且可替换/移除），
 * 避免「移除封面」后仍从旧地址回退提交。 */
const coverImageUrl = computed(() => {
  const file = coverFiles.value[0]
  const url = file?.response?.url ?? file?.url
  return typeof url === 'string' ? url : ''
})
const bodyImageInput = ref<HTMLInputElement | null>(null)
const pendingBodyAnchor = ref<ArticleInsertionAnchor | null>(null)
/* 正文插图上传中：记录触发插入位用于按钮 loading，并禁用全部插入入口防重复触发 */
const bodyUploadingAt = ref<number | null>(null)
const pendingBodyIndex = ref<number | null>(null)
const blocks = ref<ArticleContentBlock[]>([])
const nextBlockId = ref(1)
const activeBlockToolsId = ref<number | null>(null)
const submitting = ref(false)
const submittedId = ref('')
const loaded = ref(false)
const baseline = ref('')

const columns = computed(() => columnData.value ?? [])
const contentLength = computed(() => articleVisibleTextLength(blocks.value))
const imageCount = computed(() => blocks.value.filter((block) => block.type === 'image').length)
const contentReady = computed(() => contentLength.value >= MIN_CONTENT)
/* v40：正文达标后清除行内错误（须在 contentReady 声明之后注册，避免 TDZ） */
watch(contentReady, (ready) => {
  if (ready) errors.content = ''
})
const content = computed(() => serializeArticleContent(blocks.value))

/* 投稿摘要：优先沿用原投稿摘要，否则取正文纯文本首段（去除 HTML 标签，≤120 字） */
const existingSummary = ref('')
function deriveSummary(): string | undefined {
  const kept = existingSummary.value.trim()
  if (kept) return kept.slice(0, 120)
  const plain = blocks.value.reduce((acc, block) => acc || (block.type === 'text' ? block.text.trim() : ''), '')
  const summary = plain.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return summary || undefined
}
const editorSnapshot = computed(() => JSON.stringify({
  ...form,
  coverUrl: coverImageUrl.value,
  blocks: blocks.value.map((block) => block.type === 'text'
    ? { type: block.type, text: block.text }
    : { type: block.type, url: block.url }),
}))
const { markClean } = useUnsavedGuard(() => loaded.value && !submittedId.value && editorSnapshot.value !== baseline.value)

function isIdentityPicked(identity: UserIdentity) {
  return form.asIdentity === identity.type && (identity.type !== 'community_enterprise' || form.asEnterpriseId === (identity.enterpriseId ?? ''))
}

function pickIdentity(identity: UserIdentity) {
  form.asIdentity = identity.type
  form.asEnterpriseId = identity.type === 'community_enterprise' ? (identity.enterpriseId ?? '') : ''
}

function ensureVisibleIdentitySelection() {
  if (identityOptions.value.some(isIdentityPicked)) return
  const first = identityOptions.value[0]
  if (first) pickIdentity(first)
  else {
    form.asIdentity = ''
    form.asEnterpriseId = ''
  }
}

watch(identityOptions, ensureVisibleIdentitySelection, { deep: true })

onMounted(async () => {
  await loadColumns()
  try {
    const list = await fetchMyIdentities()
    delegatedIdentities.value = list
      .filter((identity) => identity.type === 'community_enterprise' && identity.enterpriseId && (identity.isContact || (identity.permissions ?? []).includes('article_submit')))
      .map((identity): UserIdentity => ({ type: 'community_enterprise', enterpriseId: identity.enterpriseId, enterpriseName: identity.name }))
  } catch {
    /* 身份接口异常时保留登录会话中的基础身份。 */
  }
  if (reviseId) {
    try {
      const payload = await fetchMyArticlePayload(reviseId)
      form.title = payload.title
      form.columnCode = payload.columnCode
      /* 原栏目已关闭投稿/停用后不再出现在开放列表中：清空选择并提示重选，避免提交时才报错 */
      if (form.columnCode && columnData.value && !columns.value.some((c) => c.code === form.columnCode)) {
        form.columnCode = ''
        Toast('原栏目已关闭投稿，请重新选择栏目')
      }
      form.asIdentity = payload.asIdentity
      form.asEnterpriseId = payload.asEnterpriseId ?? ''
      ensureVisibleIdentitySelection()
      /* 已有封面回显到 Upload：用户能看到并可替换/移除 */
      coverFiles.value = payload.coverUrl
        ? [{ url: payload.coverUrl, name: '已有封面', status: 'success' }]
        : []
      existingSummary.value = payload.summary ?? ''
      blocks.value = parseArticleContent(payload.content, () => nextBlockId.value++)
      if (!blocks.value.length) insertText(0)
    } catch (e) {
      Toast(e instanceof ApiError ? e.message : '加载原投稿失败')
    }
    baseline.value = editorSnapshot.value
    loaded.value = true
    return
  }
  const first = identityOptions.value[0]
  if (first) pickIdentity(first)
  insertText(0)
  baseline.value = editorSnapshot.value
  loaded.value = true
})

async function requestImage(file: UploadFile | UploadFile[]) {
  const target = Array.isArray(file) ? file[0] : file
  const raw = target?.raw as File | undefined
  if (!raw) return { status: 'fail' as const, error: '图片读取失败，请重试', response: {} }
  try {
    const info = await uploadFile(raw, 'article')
    return { status: 'success' as const, response: { url: info.url } }
  } catch (e) {
    return { status: 'fail' as const, error: e instanceof ApiError ? e.message : '上传失败，请重试', response: {} }
  }
}

function insertText(index: number) {
  const id = nextBlockId.value++
  blocks.value.splice(index, 0, { id, type: 'text', text: '' })
}

function insertImage(response: { url?: string; anchor?: ArticleInsertionAnchor }) {
  if (!response.url) return
  const imageId = nextBlockId.value++
  const index = response.anchor ? resolveArticleInsertionIndex(blocks.value, response.anchor) : blocks.value.length
  blocks.value.splice(index, 0, { id: imageId, type: 'image', url: response.url })
}

/* 正文插图：隐藏文件输入 + 普通按钮，保证插入入口始终可见 */
function triggerBodyImage(index: number) {
  pendingBodyIndex.value = index
  pendingBodyAnchor.value = articleInsertionAnchor(blocks.value, index)
  bodyImageInput.value?.click()
}

async function onBodyImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const anchor = pendingBodyAnchor.value ?? undefined
  pendingBodyAnchor.value = null
  input.value = ''
  if (!file) return
  /* 正文插图仅接受图片：uploadFile 统一校验之外再拦截 PDF 等非图片文件 */
  if (!file.type.startsWith('image/')) {
    Toast('正文插图仅支持图片文件')
    return
  }
  bodyUploadingAt.value = pendingBodyIndex.value
  pendingBodyIndex.value = null
  try {
    const info = await uploadFile(file, 'article')
    insertImage({ url: info.url, anchor })
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '上传失败，请重试')
  } finally {
    bodyUploadingAt.value = null
  }
}

/* 删除内容块不可恢复（可能含数百字正文/已上传配图），与页内其它破坏性操作一致需二次确认 */
function removeBlock(id: number) {
  const dialog = DialogPlugin.confirm({
    title: '删除该内容块？',
    content: '删除后不可恢复。',
    cancelBtn: '取消',
    confirmBtn: '删除',
    onConfirm: () => {
      blocks.value = blocks.value.filter((block) => block.id !== id)
      activeBlockToolsId.value = null
      if (!blocks.value.length) insertText(0)
      dialog.destroy()
    },
    onClose: () => dialog.destroy(),
  })
}

function moveBlock(index: number, offset: -1 | 1) {
  blocks.value = moveArticleContentBlock(blocks.value, index, offset)
}

async function onSubmit() {
  errors.title = ''
  errors.column = ''
  errors.identity = ''
  errors.content = ''
  if (!form.title.trim()) {
    errors.title = '请输入文章标题'
    return void Toast(errors.title)
  }
  if (!form.columnCode) {
    errors.column = '请选择栏目'
    return void Toast(errors.column)
  }
  if (!form.asIdentity) {
    errors.identity = '请选择投稿身份'
    return void Toast(errors.identity)
  }
  if (!contentReady.value) {
    errors.content = `正文至少 ${MIN_CONTENT} 字`
    return void Toast(errors.content)
  }
  const payload = {
    title: form.title.trim(),
    columnCode: form.columnCode,
    asIdentity: form.asIdentity,
    ...(form.asIdentity === 'community_enterprise' && form.asEnterpriseId ? { asEnterpriseId: form.asEnterpriseId } : {}),
    coverUrl: coverImageUrl.value || undefined,
    content: content.value,
    summary: deriveSummary(),
  }
  submitting.value = true
  try {
    if (revising.value) {
      await resubmitArticle(reviseId, payload)
      markClean()
      submittedId.value = reviseId
    } else {
      const result = await createArticle(payload)
      markClean()
      submittedId.value = result.id
    }
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '投稿失败，请稍后重试')
  } finally { submitting.value = false }
}
</script>

<template>
  <div class="page-fade-in m-new-article">
    <FlowResult
      v-if="submittedId"
      :title="revising ? '投稿已重新提交' : '投稿已提交'"
      description="内容已进入审核队列；审核通过后将发布并按规则发放积分。"
      :reference="submittedId"
      primary-text="查看我的投稿"
      secondary-text="返回资讯广场"
      @primary="router.replace('/me/articles')"
      @secondary="router.replace('/plaza?tab=articles')"
    />
    <template v-else>
    <header class="head">
      <p class="page-desc">{{ revising ? '修改后将重新进入审核队列' : '图文内容将随投稿一并进入审核' }}</p>
    </header>

    <div class="m-card form">
      <div class="field"><label class="field-label">标题<span class="req"> *</span></label><Input v-model="form.title" :maxlength="50" placeholder="请输入文章标题…" clearable /><p v-if="errors.title" class="field-error">{{ errors.title }}</p></div>
      <div class="field"><label class="field-label">栏目<span class="req"> *</span></label><div class="chips"><CheckTag v-for="c in columns" :key="c.code" class="chip" size="medium" variant="light" :checked="form.columnCode === c.code" @change="form.columnCode = c.code">{{ c.label }}</CheckTag></div><p v-if="!columnsLoading && !columnsError && columnData && !columns.length" class="field-help">暂无可投稿栏目，请稍后再试</p><p v-if="errors.column" class="field-error">{{ errors.column }}</p></div>
      <div class="field"><label class="field-label">投稿身份<span class="req"> *</span></label><div class="chips"><CheckTag v-for="identity in identityOptions" :key="`${identity.type}:${identity.enterpriseId ?? ''}`" size="medium" variant="light" :checked="isIdentityPicked(identity)" @change="pickIdentity(identity)">{{ identityOptionLabel(identity, auth.name) }}</CheckTag></div><p v-if="errors.identity" class="field-error">{{ errors.identity }}</p></div>
      <div class="field"><label class="field-label">文章封面（选填）</label><p class="field-help">建议使用清晰的横版图片，将展示在文章列表中。</p><Upload v-model:files="coverFiles" class="cover-upload" theme="grid" accept="image/*" :max="1" :size-limit="{ size: 10, unit: 'MB' }" :request-method="requestImage" /></div>
      <div class="field"><label class="field-label">正文</label><p class="field-help">直接输入正文；需要图文混排时，可在段落间插入图片或新段落。至少 {{ MIN_CONTENT }} 字。</p>
        <div class="editor-blocks">
          <template v-for="(block, index) in [...blocks, null]" :key="block?.id ?? 'editor-end'">
          <div v-if="index > 0 || !blocks.length" class="insert-actions" role="group" :aria-label="`在第 ${index + 1} 个位置插入内容`">
            <Button size="small" theme="light" :disabled="bodyUploadingAt !== null" @click="insertText(index)">
              <template #icon><Icon aria-hidden="true" name="textbox" size="16px" /></template>
              插入段落
            </Button>
            <Button size="small" theme="light" :loading="bodyUploadingAt === index" :disabled="bodyUploadingAt !== null && bodyUploadingAt !== index" @click="triggerBodyImage(index)">
              <template #icon><Icon aria-hidden="true" name="image" size="16px" /></template>
              {{ bodyUploadingAt === index ? '上传中…' : '插入图片' }}
            </Button>
          </div>
          <div v-if="block" class="editor-block">
            <div class="block-toolbar">
              <span class="block-order">内容 {{ index + 1 }} · {{ block.type === 'image' ? '图片' : '文字' }}</span>
              <Button size="small" variant="text" :aria-expanded="activeBlockToolsId === block.id" @click="activeBlockToolsId = activeBlockToolsId === block.id ? null : block.id">调整</Button>
              <div v-if="activeBlockToolsId === block.id" class="block-actions">
                <Button size="small" variant="text" shape="square" :disabled="index === 0" :aria-label="`上移第 ${index + 1} 个内容块`" @click="moveBlock(index, -1)">
                  <template #icon><Icon aria-hidden="true" name="arrow-up" size="18px" /></template>
                </Button>
                <Button size="small" variant="text" shape="square" :disabled="index === blocks.length - 1" :aria-label="`下移第 ${index + 1} 个内容块`" @click="moveBlock(index, 1)">
                  <template #icon><Icon aria-hidden="true" name="arrow-down" size="18px" /></template>
                </Button>
                <Button size="small" variant="text" shape="square" theme="danger" :aria-label="`删除第 ${index + 1} 个${block.type === 'image' ? '图片' : '文字'}内容块`" @click="removeBlock(block.id)">
                  <template #icon><Icon aria-hidden="true" name="delete" size="18px" /></template>
                </Button>
              </div>
            </div>
            <div v-if="block.type === 'text'" class="text-block"><Textarea v-model="block.text" :autosize="{ minRows: 4, maxRows: 12 }" placeholder="写下这一段内容…" /></div>
            <figure v-else class="image-block"><Image :src="block.url" alt="正文配图" fit="cover" /></figure>
          </div>
          </template>
        </div>
        <input ref="bodyImageInput" class="body-image-input" type="file" accept="image/*" @change="onBodyImageChange" />
        <p class="count" :class="{ ready: contentReady }">正文 {{ formatZhNumber(contentLength) }}/{{ MIN_CONTENT }} 字 · {{ formatZhNumber(imageCount) }} 图</p>
        <p v-if="errors.content" class="field-error">{{ errors.content }}</p>
      </div>
      <Button class="mobile-sticky-action" theme="primary" size="large" block :loading="submitting" @click="onSubmit">{{ contentReady ? (revising ? '重新提交' : '提交投稿') : `投稿内容需≥${MIN_CONTENT}字` }}</Button>
    </div>
    </template>
  </div>
</template>

<style scoped>
.m-new-article { display: flex; flex-direction: column; gap:var(--app-space-6); padding:var(--app-space-8); }
.head { padding:0 var(--app-space-1); }.head .page-desc { margin:0; color: var(--td-text-color-secondary); font: var(--app-type-body); }
.field { margin-bottom:var(--app-space-9); }.field label, .field .field-label { display: block; margin-bottom:var(--app-space-3); color: var(--td-text-color-secondary); font: var(--app-type-body-sm); }.req { color: var(--td-error-color); }.field-help { margin:-2px 0 var(--app-space-4); }
.chips { display: flex; flex-wrap: wrap; gap:var(--app-space-4); }.field-error { margin:var(--app-space-3) 0 0; font: var(--app-type-caption); color: var(--td-error-color); }.cover-upload { width: fit-content; grid-template-columns: var(--td-upload-width, 80px); justify-content: start; padding: 0; }.editor-blocks { display: flex; flex-direction: column; gap:var(--app-space-6); }.editor-block { padding:var(--app-space-5); border: 1px solid var(--td-component-border); border-radius: var(--td-radius-large); background: var(--td-bg-color-secondarycontainer); }.block-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--app-space-4); margin-bottom: var(--app-space-3); }.block-order { min-width: 0; color: var(--td-text-color-secondary); font: var(--app-type-caption); }.block-actions { display: flex; align-items: center; flex-shrink: 0; }.block-actions :deep(.t-button) { min-width: 44px; padding: 0; }.insert-actions { display: flex; align-items: center; gap:var(--app-space-5); }.insert-actions :deep(.t-button--size-small) { min-height: 44px; }.body-image-input { display: none; }.image-block { margin:0; overflow: hidden; border-radius: var(--td-radius-default); background: var(--td-bg-color-container); }.image-block img { display: block; width: 100%; max-height: 280px; object-fit: cover; aspect-ratio: 16 / 9; }.count { margin:var(--app-space-4) 0 0; color: var(--td-error-color); font: var(--app-type-caption); text-align: center; }.count.ready { color: var(--td-text-color-placeholder); }
</style>
