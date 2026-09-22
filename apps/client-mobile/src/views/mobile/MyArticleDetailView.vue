<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchMyArticle } from '@/api/contents'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MySubmittedArticleDetail } from '@/types'
import { formatLocalDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const { data: article, loading, error, run } = useAsyncList<MySubmittedArticleDetail>(() => fetchMyArticle(id))
onMounted(run)
</script>

<template>
  <div class="detail-page page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="article">
      <article class="m-card article-head">
        <div class="head"><span>{{ article.columnLabel }}</span><StateTag kind="article" :value="article.status" /></div>
        <h2>{{ article.title }}</h2>
        <p>{{ article.authorName }} · 编号 {{ article.id }}</p>
        <p>提交于 {{ formatLocalDateTime(article.submittedAt) }}</p>
        <p v-if="article.scheduledAt">计划发布于 {{ formatLocalDateTime(article.scheduledAt) }}</p>
        <p v-if="article.publishedAt">发布于 {{ formatLocalDateTime(article.publishedAt) }}</p>
        <p v-if="article.identityName">投稿主体：{{ article.identityName }}</p>
      </article>
      <section v-if="article.rejectReason" class="m-card review"><h3>审核意见</h3><p>{{ article.rejectReason }}</p></section>
      <section class="m-card content"><h3>投稿正文</h3><RichTextBlock :html="article.content" /></section>
      <!-- 返回是二级页唯一出口，用描边按钮形态（非文字链）保持可识别与 44px 命中区 -->
      <Button block variant="outline" @click="router.push('/me/articles')">返回我的投稿</Button>
    </template>
  </div>
</template>

<style scoped>
.detail-page { padding: var(--app-space-8); display: flex; flex-direction: column; gap: var(--app-space-5); }
.article-head, .content, .review { display: flex; flex-direction: column; gap: var(--app-space-4); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--app-space-4); font-size: var(--app-font-caption); color: var(--td-brand-color); }
h2, h3, p { margin: 0; }
h2 { font-size: var(--app-font-subtitle); line-height: 1.45; }
h3 { font-size: var(--app-font-body); }
.article-head p { font-size: var(--app-font-caption); color: var(--td-text-color-placeholder); }
.review { border-color: var(--td-error-color-3); }
.review p { font-size: var(--app-font-body); line-height: 1.7; color: var(--td-error-color); }
</style>
