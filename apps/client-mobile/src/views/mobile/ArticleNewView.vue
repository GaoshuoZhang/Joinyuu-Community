<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, Input, Tag, Textarea, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useDraft } from '@/composables/useDraft'
import { createArticle, fetchColumns, fetchMyArticlePayload, resubmitArticle } from '@/api/contents'
import { fetchMyIdentities } from '@/api/enterprises'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'
import { identityOptionLabel, useAuthStore } from '@/stores/auth'
import type { ArticleColumn, IdentityType, UserIdentity } from '@/types'

const MIN_CONTENT = 30
type ContentBlock = { id: number; type: 'text' | 'image'; text?: string; url?: string }

const router = useRouter()
const route = useRoute()
/** v34 修改重提：携带 ?revise=<投稿 id> 进入本页 */
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)
const auth = useAuthStore()
const { data: columnData, run: loadColumns } = useAsyncList<ArticleColumn[]>(fetchColumns)
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities.filter((identity) => !(identity.type === 'individual' && auth.hasCommunityIndividual))
  const extra = delegatedIdentities.value.filter(
    (delegated) => !base.some((identity) => identity.type === 'community_enterprise' && identity.enterpriseId === delegated.enterpriseId),
  )
  return [...base, ...extra]
})
const form = reactive({ title: '', columnCode: '', asIdentity: '' as IdentityType | '', asEnterpriseId: '' })
/* v40：投稿校验行内错误（与 Toast 并存，错误可随修改清除） */
const errors = reactive({ title: '', column: '', identity: '', content: '' })
watch(() => form.title, () => (errors.title = ''))
watch(() => form.columnCode, () => (errors.column = ''))
watch(() => form.asIdentity, () => (errors.identity = ''))
const coverFiles = ref<UploadFile[]>([])
const coverUrl = ref('')
const bodyImageFiles = ref<UploadFile[]>([])
const blocks = ref<ContentBlock[]>([])
const nextBlockId = ref(1)
const submitting = ref(false)

/* v36 草稿自动保存；v38 修复放弃回写与空草稿，修改重提不写草稿 */
const {
  hasDraft: draftAvailable,
  savedAt: draftSavedAt,
  detect: detectDraft,
  restore: restoreDraft,
  discard: discardDraft,
  clear: clearDraft,
} = useDraft(
  'article',
  () => ({ ...form, coverUrl: coverUrl.value, blocks: blocks.value, nextBlockId: nextBlockId.value }),
  (value) => {
    form.title = value.title
    form.columnCode = value.columnCode
    form.asIdentity = value.asIdentity
    form.asEnterpriseId = value.asEnterpriseId
    coverUrl.value = value.coverUrl
    blocks.value = value.blocks
    nextBlockId.value = value.nextBlockId
  },
  {
    enabled: () => !revising.value,
    isEmpty: () => !form.title.trim() && !blocks.value.some((block) => block.type === 'image' || (block.text ?? '').trim()),
  },
)

const columns = computed(() => columnData.value ?? [])
const contentLength = computed(() => blocks.value.filter((block) => block.type === 'text').reduce((sum, block) => sum + (block.text?.trim().length ?? 0), 0))
const imageCount = computed(() => blocks.value.filter((block) => block.type === 'image').length)
const contentReady = computed(() => contentLength.value >= MIN_CONTENT)
/* v40：正文达标后清除行内错误（须在 contentReady 声明之后注册，避免 TDZ） */
watch(contentReady, (ready) => {
  if (ready) errors.content = ''
})
const content = computed(() => blocks.value.map((block) => block.type === 'image' ? `![正文图片](${block.url})` : block.text?.trim()).filter(Boolean).join('\n\n'))

function isIdentityPicked(identity: UserIdentity) {
  return form.asIdentity === identity.type && (identity.type !== 'community_enterprise' || form.asEnterpriseId === (identity.enterpriseId ?? ''))
}

function pickIdentity(identity: UserIdentity) {
  form.asIdentity = identity.type
  form.asEnterpriseId = identity.type === 'community_enterprise' ? (identity.enterpriseId ?? '') : ''
}

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
      form.asIdentity = payload.asIdentity
      form.asEnterpriseId = payload.asEnterpriseId ?? ''
      coverUrl.value = payload.coverUrl ?? ''
      blocks.value = parseContent(payload.content)
    } catch (e) {
      Toast(e instanceof ApiError ? e.message : '加载原投稿失败')
    }
    return
  }
  const first = identityOptions.value[0]
  if (first) pickIdentity(first)
  /* v36：探测未提交草稿 */
  detectDraft()
})

/** 重提时把 Markdown 正文还原为段落/图片块 */
function parseContent(content: string): ContentBlock[] {
  const result: ContentBlock[] = []
  for (const part of content.split(/\n{2,}/)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const image = trimmed.match(/^!\[[^\]]*\]\((.+)\)$/)
    if (image) result.push({ id: nextBlockId.value++, type: 'image', url: image[1] })
    else result.push({ id: nextBlockId.value++, type: 'text', text: trimmed })
  }
  return result
}

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

function addText() {
  const id = nextBlockId.value++
  blocks.value.push({ id, type: 'text', text: '' })
}

function insertImage(response: { url?: string }) {
  if (!response.url) return
  const imageId = nextBlockId.value++
  blocks.value.push({ id: imageId, type: 'image', url: response.url })
}

function onBodyImageSuccess(response: { url?: string }) {
  insertImage(response)
  bodyImageFiles.value = []
}

function removeBlock(id: number) {
  blocks.value = blocks.value.filter((block) => block.id !== id)
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
    coverUrl: String(coverFiles.value[0]?.response?.url ?? coverFiles.value[0]?.url ?? coverUrl.value ?? '') || undefined,
    content: content.value,
  }
  submitting.value = true
  try {
    if (revising.value) {
      await resubmitArticle(reviseId, payload)
      Toast('已重新提交审核')
    } else {
      await createArticle(payload)
      Toast('投稿已提交，审核通过后发放积分')
    }
    clearDraft()
    await router.push('/me/articles')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '投稿失败，请稍后重试')
  } finally { submitting.value = false }
}
</script>

<template>
  <div class="page-fade-in m-new-article">
    <header class="head">
      <h2 class="page-title">{{ revising ? '修改重提' : '投稿' }}</h2>
      <p class="page-desc">{{ revising ? '修改后将重新进入审核队列' : '图文内容将随投稿一并进入审核' }}</p>
    </header>

    <div v-if="draftAvailable && !revising" class="draft-bar">
      <span>检测到 {{ draftSavedAt }} 的未提交草稿</span>
      <a v-pressable @click="restoreDraft">恢复</a>
      <a v-pressable @click="discardDraft">放弃</a>
    </div>
    <div class="m-card form">
      <div class="field"><label>标题</label><Input v-model="form.title" :maxlength="50" placeholder="请输入文章标题…" clearable /><p v-if="errors.title" class="field-error">{{ errors.title }}</p></div>
      <div class="field"><span class="field-label">栏目</span><div class="chips"><Tag v-for="c in columns" :key="c.code" class="chip" size="medium" :theme="form.columnCode === c.code ? 'primary' : 'default'" variant="light" @click="form.columnCode = c.code">{{ c.label }}</Tag></div><p v-if="errors.column" class="field-error">{{ errors.column }}</p></div>
      <div class="field"><span class="field-label">投稿身份</span><div class="chips"><Tag v-for="identity in identityOptions" :key="`${identity.type}:${identity.enterpriseId ?? ''}`" size="medium" variant="light" :theme="isIdentityPicked(identity) ? 'primary' : 'default'" @click="pickIdentity(identity)">{{ identityOptionLabel(identity, auth.name) }}</Tag></div><p v-if="errors.identity" class="field-error">{{ errors.identity }}</p></div>
      <div class="field"><span class="field-label">文章封面（选填）</span><p class="field-help">建议使用清晰的横版图片，将展示在文章列表中。</p><Upload v-model:files="coverFiles" theme="grid" accept="image/*" :max="1" :size-limit="{ size: 10, unit: 'MB' }" :request-method="requestImage" /></div>
      <div class="field"><span class="field-label">正文</span><p class="field-help">可在任意段落之后插入图片，图片会按内容顺序发布。</p>
        <div class="editor-blocks">
          <div v-for="block in blocks" :key="block.id" class="editor-block">
            <Button class="remove-block" size="extra-small" shape="circle" theme="danger" :aria-label="block.type === 'image' ? '删除图片' : '删除段落'" @click="removeBlock(block.id)"><Icon name="delete" size="16px" /></Button>
            <div v-if="block.type === 'text'" class="text-block"><Textarea v-model="block.text" :autosize="{ minRows: 4, maxRows: 12 }" placeholder="写下这一段内容…" /></div>
            <figure v-else class="image-block"><img :src="block.url" alt="正文配图" decoding="async" /></figure>
          </div>
          <div class="insert-actions"><Button size="small" theme="light" @click="addText"><Icon name="text" size="16px" />插入段落</Button><Upload v-model:files="bodyImageFiles" theme="grid" accept="image/*" :max="1" :add-btn="true" :preview="false" :size-limit="{ size: 10, unit: 'MB' }" :request-method="requestImage" @success="({ response }) => onBodyImageSuccess(response)"><template #addContent><Button size="small" theme="light"><Icon name="image" size="16px" />插入图片</Button></template></Upload></div>
        </div>
        <p class="count" :class="{ ready: contentReady }">输入统计：{{ contentLength }}字 | {{ imageCount }}图</p>
        <p v-if="errors.content" class="field-error">{{ errors.content }}</p>
      </div>
      <Button theme="primary" size="large" block :disabled="!contentReady" :loading="submitting" @click="onSubmit">{{ contentReady ? (revising ? '重新提交' : '提交投稿') : `投稿内容需≥${MIN_CONTENT}字` }}</Button>
    </div>
  </div>
</template>

<style scoped>
.m-new-article { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.head { padding: 0 2px; }.head .page-title { margin: 0 0 4px; font-size: 18px; }.head .page-desc { margin: 0; color: var(--td-text-color-secondary); font-size: 12px; }
.field { margin-bottom: 18px; }.field label, .field .field-label { display: block; margin-bottom: 6px; color: var(--td-text-color-secondary); font-size: 12px; }.field-help { margin: -2px 0 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }.field-error { margin: 6px 0 0; font-size: 12px; color: var(--td-error-color); }.editor-blocks { display: flex; flex-direction: column; gap: 12px; }.editor-block { padding: 10px; border: 1px solid var(--td-component-border); border-radius: var(--td-radius-large); background: var(--td-bg-color-secondarycontainer); }.remove-block { display: flex; margin: -2px 0 6px auto; box-shadow: var(--td-shadow-1); }.insert-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.insert-actions :deep(.t-button), .insert-actions :deep(.t-upload), .insert-actions :deep(.t-upload__item), .insert-actions :deep(.t-upload__add-icon) { width: 100%; }.insert-actions :deep(.t-upload) { grid-template-columns: minmax(0, 1fr); gap: 0; padding: 0; }.insert-actions :deep(.t-upload), .insert-actions :deep(.t-upload__item), .insert-actions :deep(.t-upload__add-icon) { height: 44px; min-height: 44px; }.insert-actions :deep(.t-button--size-small) { min-height: 44px; }.insert-actions :deep(.t-upload__item) { margin: 0; padding: 0; border: 0; background: transparent; }.insert-actions :deep(.t-upload__add-icon) { position: static; transform: none; }.image-block { margin: 0; overflow: hidden; border-radius: var(--td-radius-default); background: var(--td-bg-color-container); }.image-block img { display: block; width: 100%; max-height: 280px; object-fit: cover; aspect-ratio: 16 / 9; }.count { margin: 8px 0 0; color: var(--td-error-color); font-size: 12px; text-align: center; }.count.ready { color: var(--td-text-color-placeholder); }
.draft-bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--td-radius-default); background: var(--td-warning-color-1, #fff1e9); font-size: 12px; color: var(--td-text-color-secondary); }.draft-bar a { color: var(--td-brand-color); cursor: pointer; }.draft-bar a:first-of-type { margin-left: auto; }
</style>
