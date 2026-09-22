<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Image, Tag, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { createArticleComment, deleteArticleComment, fetchArticle, fetchArticleComments, toggleArticleLike } from '@/api/contents'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { shareContent } from '@/utils/share'
import { onImageError } from '@/utils/imageFallback'
import { actionIdentityOptions, useAuthStore } from '@/stores/auth'
import { addReadingHistory } from '@/utils/readingHistory'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import ArticleContent from '@/components/contents/ArticleContent.vue'
import ArticleComments from '@/components/contents/ArticleComments.vue'
import type { Article, ArticleComment, UserIdentity } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动文章详情：正文支持客户端投稿生成的 Markdown 图片行，兼容既有纯文本内容；
 * v37 支持收藏，v38 支持点赞与评论。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const { data, loading, error, run } = useAsyncList<Article>(() => fetchArticle(String(route.params.id)))
const article = computed(() => data.value)

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
const commentsLoading = ref(false)
const commentsError = ref('')
const commentText = ref('')
const commentError = ref('')
const commentIdentities = computed(() => actionIdentityOptions(auth.identities))
watch(commentText, () => (commentError.value = ''))
const commenting = ref(false)

watch(article, (value) => {
  if (!value) return
  likeCount.value = value.likeCount ?? 0
  liked.value = value.liked ?? false
})

/* 评论加载：失败不伪装成「暂无评论」，交由评论区展示错误 + 重试 */
async function loadComments() {
  if (!article.value?.commentsEnabled) {
    comments.value = []
    commentsError.value = ''
    return
  }
  commentsLoading.value = true
  commentsError.value = ''
  try {
    comments.value = await fetchArticleComments(String(route.params.id))
  } catch (e) {
    comments.value = []
    commentsError.value = e instanceof Error ? e.message : '评论加载失败，请稍后重试'
  } finally {
    commentsLoading.value = false
  }
}

async function onLike() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const nextLiked = !liked.value
  const nextCount = likeCount.value + (nextLiked ? 1 : -1)
  liked.value = nextLiked
  likeCount.value = nextCount
  try {
    const res = await toggleArticleLike(String(route.params.id))
    liked.value = res.liked
    likeCount.value = res.likeCount
  } catch (e) {
    liked.value = !nextLiked
    likeCount.value = nextCount + (nextLiked ? -1 : 1)
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

async function onComment(identity: UserIdentity | null) {
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
    await createArticleComment(String(route.params.id), commentText.value, identity?.type, identity?.enterpriseId)
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

/* 删除自己的评论（二次确认） */
function onDeleteComment(item: ArticleComment) {
  const dialog = DialogPlugin.confirm({
    title: '删除评论',
    content: '确认删除这条评论？删除后无法恢复。',
    cancelBtn: '取消',
    confirmBtn: '确认删除',
    onConfirm: async () => {
      dialog.hide()
      try {
        await deleteArticleComment(String(route.params.id), item.id)
        Toast('评论已删除')
        await loadComments()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '删除失败，请稍后重试')
      }
    },
  })
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
  /* 与活动详情一致：先显式判登录，未登录直接跳登录并带 redirect，不依赖错误信息文本匹配 */
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const next = !favorited.value
  favorited.value = next
  try {
    const item = article.value
    favorited.value = await toggleFavorite('article', String(route.params.id), item?.title ?? '', item?.columnLabel)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    favorited.value = !next
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}
</script>

<template>
  <div class="page-fade-in m-detail">
    <ListSkeleton v-if="loading" />
    <template v-else-if="error">
      <EmptyBlock :text="error" action-text="重试" @action="run" />
    </template>
    <template v-else-if="article">
      <header class="head">
        <Tag class="col-tag" size="small" variant="light" theme="primary">{{ article.columnLabel }}</Tag>
        <h2 class="title">{{ article.title }}</h2>
        <p class="meta">{{ article.authorName }} · {{ formatLocalDateTime(article.publishedAt) }} · {{ formatZhNumber(article.views) }} 次浏览</p>
      </header>
      <Image v-if="article.coverUrl" class="cover" :src="article.coverUrl" :alt="article.title" fit="cover" lazy @error="onImageError" />
      <ArticleContent :content="article.content ?? ''" />
      <div class="foot-actions">
        <Button size="small" :theme="liked ? 'primary' : 'default'" variant="outline" @click="onLike">
          <template #icon><Icon aria-hidden="true" :name="liked ? 'heart-filled' : 'heart'" size="16px" /></template>
          点赞 {{ formatZhNumber(likeCount) }}
        </Button>
        <Button size="small" variant="outline" @click="onToggleFavorite">
          <template #icon><Icon aria-hidden="true" :name="favorited ? 'star-filled' : 'star'" size="16px" /></template>
          {{ favorited ? '已收藏' : '收藏' }}
        </Button>
        <Button size="small" variant="outline" :loading="sharing" @click="onShare">
          <template #icon><Icon aria-hidden="true" name="share" size="16px" /></template>
          分享
        </Button>
      </div>

      <ArticleComments
        v-if="article.commentsEnabled"
        v-model="commentText"
        :comments="comments"
        :loading="commentsLoading"
        :load-error="commentsError"
        :identities="commentIdentities"
        :user-name="auth.name"
        :submitting="commenting"
        :error="commentError"
        :current-uid="auth.uid || undefined"
        @submit="onComment"
        @delete="onDeleteComment"
        @retry="loadComments"
      />
      <section v-else class="m-card comments-disabled" aria-live="polite">该文章已关闭评论</section>
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.foot-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap:var(--app-space-6);
}


.head {
  padding:0 var(--app-space-1);
}

.col-tag {
  display: inline-flex;
}

.title {
  margin:var(--app-space-4) 0 var(--app-space-3);
  font-size: var(--app-font-title);
  line-height: 1.45;
}

.meta {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.cover { max-height: 240px; aspect-ratio: 16 / 9; }
.comments-disabled {
  padding:var(--app-space-8);
  text-align: center;
  color: var(--td-text-color-secondary);
  font-size: var(--app-font-body);
}

</style>
