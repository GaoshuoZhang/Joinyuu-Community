<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchArticle } from '@/api/contents'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { Article } from '@/types'

/* 移动文章详情：正文支持客户端投稿生成的 Markdown 图片行，兼容既有纯文本内容。 */
const route = useRoute()

const { data, loading, error, run } = useAsyncList<Article>(() => fetchArticle(String(route.params.id)))
const article = computed(() => data.value)
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

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-detail">
    <Loading v-if="loading" class="state" text="加载中…" />
    <template v-else-if="error">
      <EmptyBlock :text="error" />
    </template>
    <template v-else-if="article">
      <header class="head">
        <span class="col-tag">{{ article.columnLabel }}</span>
        <h1 class="title">{{ article.title }}</h1>
       <p class="meta">{{ article.authorName }} · {{ article.publishedAt }} · {{ article.views }} 次浏览</p>
      </header>
      <img v-if="article.coverUrl" class="cover" :src="article.coverUrl" :alt="article.title" />
      <article class="m-card body">
        <template v-for="(block, i) in contentBlocks" :key="i">
          <img v-if="block.type === 'image'" class="content-image" :src="block.url" alt="文章配图" />
          <p v-else class="para">{{ block.text }}</p>
        </template>
      </article>
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

.state {
  padding: 20px 0;
}

.head {
  padding: 0 2px;
}

.col-tag {
  display: inline-block;
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
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
  object-fit: cover;
}

.cover { max-height: 240px; }
.content-image { margin: 0 0 12px; max-height: 420px; }

.para {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--td-text-color-primary);
}

.para:last-child {
  margin-bottom: 0;
}
</style>
