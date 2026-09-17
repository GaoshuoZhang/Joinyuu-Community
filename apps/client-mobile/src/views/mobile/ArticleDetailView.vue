<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Icon, Image, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import DOMPurify from 'dompurify'
import { useAsyncList } from '@/composables/useAsyncList'
import { createArticleComment, fetchArticle, fetchArticleComments, toggleArticleLike } from '@/api/contents'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { shareContent } from '@/utils/share'
import { onImageError } from '@/utils/imageFallback'
import { submitReport } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { addReadingHistory } from '@/utils/readingHistory'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'
import type { Article, ArticleComment, ReportTargetType } from '@/types'

/* 移动文章详情：正文支持客户端投稿生成的 Markdown 图片行，兼容既有纯文本内容；
 * v35 支持举报，v37 支持收藏，v38 支持点赞与评论。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const { data, loading, error, run } = useAsyncList<Article>(() => fetchArticle(String(route.params.id)))
const article = computed(() => data.value)
const isRichContent = computed(() => /<\/?[a-z][^>]*>/i.test(data.value?.content ?? ''))
const richContent = computed(() => DOMPurify.sanitize(data.value?.content ?? ''))
const contentBlocks = computed(() =>
  (data.value?.content ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => {
      const image = text.match(/^!\[[^\]]*\]\((.+)\)$/)
      return image ? { type: 'image' as const, url: image[1] } : { type: 'text' as const, text }
    }),
)

const reportVisible = ref(false)
/* v40：举报目标动态化（文章 / 评论） */
const reportTarget = ref<{ type: ReportTargetType; id: string; title: string } | null>(null)
const REPORT_REASONS = ['内容不实', '疑似抄袭', '违规 / 不良信息', '广告推广', '其他']
const COMMENT_REPORT_REASONS = ['垃圾广告', '骚扰 / 辱骂', '违规信息', '不实信息', '其他']

function openArticleReport() {
  reportTarget.value = { type: 'article', id: String(route.params.id), title: article.value?.title ?? '' }
  reportVisible.value = true
}

function openCommentReport(item: ArticleComment) {
  reportTarget.value = { type: 'comment', id: item.id, title: item.content.slice(0, 20) }
  reportVisible.value = true
}

async function onReport(text: string) {
  if (!text) return void Toast('请选择举报原因')
  const target = reportTarget.value
  if (!target) return
  try {
    await submitReport({ targetType: target.type, targetId: target.id, targetTitle: target.title, reason: text })
    Toast('举报已提交，运营将核实处理')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '举报提交失败，请稍后重试')
  }
}

onMounted(async () => {
  await run()
  await loadFavorite()
  if (article.value?.commentsEnabled) await loadComments()
  const item = article.value
  if (item) addReadingHistory({ id: item.id, title: item.title })
})

/* v40：分享（统一走 utils/share，系统分享→复制链接） */
const sharing = ref(false)
async function onShare() {
  const item = article.value
  if (!item) return
  sharing.value = true
  try {
    await shareContent({ title: item.title, text: item.summary })
  } finally {
    sharing.value = false
  }
}

/* v38：点赞与评论 */
const likeCount = ref(0)
const liked = ref(false)
const comments = ref<ArticleComment[]>([])
const commentText = ref('')
const commentError = ref('')
watch(commentText, () => (commentError.value = ''))
const commenting = ref(false)

watch(article, (value) => {
  if (!value) return
  likeCount.value = value.likeCount ?? 0
  liked.value = value.liked ?? false
})

async function loadComments() {
  if (!article.value?.commentsEnabled) {
    comments.value = []
    return
  }
  try {
    comments.value = await fetchArticleComments(String(route.params.id))
  } catch {
    comments.value = []
  }
}

async function onLike() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    const res = await toggleArticleLike(String(route.params.id))
    liked.value = res.liked
    likeCount.value = res.likeCount
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

async function onComment() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  if (commentText.value.trim().length < 2) {
    commentError.value = '评论至少 2 个字'
    return void Toast(commentError.value)
  }
  commenting.value = true
  try {
    await createArticleComment(String(route.params.id), commentText.value)
    commentText.value = ''
    commentError.value = ''
    Toast('评论已发布')
    await loadComments()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '评论失败，请稍后重试')
  } finally {
    commenting.value = false
  }
}

/* v37 收藏 */
const favorited = ref(false)
async function loadFavorite() {
  try {
    const list = await listFavorites()
    favorited.value = list.some((item) => item.type === 'article' && item.targetId === String(route.params.id))
  } catch {
    favorited.value = false
  }
}

async function onToggleFavorite() {
  try {
    const item = article.value
    favorited.value = await toggleFavorite('article', String(route.params.id), item?.title ?? '', item?.columnLabel)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    if (e instanceof Error && e.message.includes('登录')) {
      await router.push({ path: '/login', query: { redirect: route.fullPath } })
      return
    }
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}
</script>

<template>
  <div class="page-fade-in m-detail">
    <Loading v-if="loading" class="state" text="加载中…" />
    <template v-else-if="error">
      <EmptyBlock :text="error" action-text="重试" @action="run" />
    </template>
    <template v-else-if="article">
      <header class="head">
        <Tag class="col-tag" size="small" variant="light" theme="primary">{{ article.columnLabel }}</Tag>
        <h1 class="title">{{ article.title }}</h1>
       <p class="meta">{{ article.authorName }} · {{ article.publishedAt }} · {{ article.views }} 次浏览</p>
      </header>
      <Image v-if="article.coverUrl" class="cover" :src="article.coverUrl" :alt="article.title" fit="cover" lazy @error="onImageError" />
      <article class="m-card body">
        <div v-if="isRichContent" class="rich-content" v-html="richContent"></div>
        <template v-else>
          <template v-for="(block, i) in contentBlocks" :key="i">
            <Image v-if="block.type === 'image'" class="content-image" :src="block.url" alt="文章配图" fit="contain" lazy @error="onImageError" />
            <p v-else class="para">{{ block.text }}</p>
          </template>
        </template>
      </article>
      <div class="foot-actions">
        <Button size="small" :theme="liked ? 'primary' : 'default'" variant="outline" @click="onLike">
          <Icon :name="liked ? 'heart-filled' : 'heart'" size="16px" />点赞 {{ likeCount }}
        </Button>
        <Button size="small" variant="outline" @click="onToggleFavorite">
          <Icon :name="favorited ? 'star-filled' : 'star'" size="16px" />{{ favorited ? '已收藏' : '收藏' }}
        </Button>
        <Button size="small" variant="outline" :loading="sharing" @click="onShare">分享</Button>
        <p class="report-link" v-pressable @click="openArticleReport">举报该内容</p>
      </div>
      <ReasonSheet
        v-model:visible="reportVisible"
        :title="reportTarget?.type === 'comment' ? '举报评论' : '举报内容'"
        :reasons="reportTarget?.type === 'comment' ? COMMENT_REPORT_REASONS : REPORT_REASONS"
        placeholder="补充说明（选填）…"
        submit-label="提交举报"
        @submit="onReport"
      />

      <section v-if="article.commentsEnabled" class="m-card comments">
        <h3 class="sec-title">评论（{{ comments.length }}）</h3>
        <div v-if="comments.length" class="comment-list">
          <div v-for="item in comments" :key="item.id" class="comment">
            <div class="comment-head">
              <span class="comment-author">{{ item.authorName }}</span>
              <span class="comment-at">{{ item.at }}</span>
              <a class="comment-report" v-pressable @click.stop="openCommentReport(item)">举报</a>
            </div>
            <p class="comment-content">{{ item.content }}</p>
          </div>
        </div>
        <p v-else class="comment-empty">暂无评论，来说两句</p>
        <Textarea v-model="commentText" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="200" placeholder="友善评论，共建社区…" />
        <p v-if="commentError" class="field-error">{{ commentError }}</p>
        <Button theme="primary" size="small" class="comment-submit" :loading="commenting" @click="onComment">发表评论</Button>
      </section>
      <section v-else class="m-card comments-disabled" aria-live="polite">该文章已关闭评论</section>
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.report-link {
  margin: 0;
  padding: 4px 2px 8px;
  text-align: right;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

.foot-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}

.foot-actions .report-link {
  padding-bottom: 4px;
}

.comments {
  display: flex;
  flex-direction: column;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}

.comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.comment-author {
  font-size: 13px;
  font-weight: 600;
}

.comment-at {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.comment-report {
  margin-left: 8px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

.comment-content {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.comment-empty {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.comment-submit {
  margin-top: 10px;
  align-self: flex-end;
}

.state {
  padding: 20px 0;
}

.head {
  padding: 0 2px;
}

.col-tag {
  display: inline-flex;
}

.title {
  margin: 8px 0 6px;
  font-size: 19px;
  line-height: 1.45;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.body {
  padding: 16px;
}

.cover,
.content-image {
  display: block;
  width: 100%;
  border-radius: var(--td-radius-large);
}

.cover { max-height: 240px; aspect-ratio: 16 / 9; }
.content-image { margin: 0 0 12px; max-height: 420px; aspect-ratio: 4 / 3; background: var(--td-bg-color-secondarycontainer); }

.para {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--td-text-color-primary);
}

.para:last-child {
  margin-bottom: 0;
}

.comments-disabled {
  padding: 16px;
  text-align: center;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}

.rich-content {
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.85;
  color: var(--td-text-color-primary);
}

.rich-content :deep(p),
.rich-content :deep(ul),
.rich-content :deep(ol),
.rich-content :deep(blockquote),
.rich-content :deep(pre) {
  margin: 0 0 12px;
}

.rich-content :deep(h1),
.rich-content :deep(h2),
.rich-content :deep(h3),
.rich-content :deep(h4) {
  margin: 20px 0 8px;
  line-height: 1.45;
}

.rich-content :deep(h1) { font-size: 20px; }
.rich-content :deep(h2) { font-size: 18px; }
.rich-content :deep(h3),
.rich-content :deep(h4) { font-size: 16px; }
.rich-content :deep(ul),
.rich-content :deep(ol) { padding-left: 22px; }
.rich-content :deep(blockquote) { padding-left: 12px; border-left: 3px solid var(--td-component-border); color: var(--td-text-color-secondary); }
.rich-content :deep(a) { color: var(--td-brand-color); text-decoration: underline; }
.rich-content :deep(img),
.rich-content :deep(video) { display: block; width: auto; max-width: 100%; height: auto; margin: 0 auto 12px; border-radius: var(--td-radius-large); }
.rich-content :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.rich-content :deep(th),
.rich-content :deep(td) { padding: 6px 8px; border: 1px solid var(--td-component-border); }
.rich-content :deep(pre) { max-width: 100%; overflow-x: auto; padding: 12px; background: var(--td-bg-color-secondarycontainer); }
.rich-content :deep(:last-child) { margin-bottom: 0; }

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}
</style>
