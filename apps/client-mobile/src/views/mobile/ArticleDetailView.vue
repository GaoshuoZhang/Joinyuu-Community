<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchArticle } from '@/api/contents'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { Article } from '@/types'

/* 移动文章详情：标题/栏目/作者/时间/浏览量 + 正文按换行分段；404 → 空态 + 返回 */
const route = useRoute()

const { data, loading, error, run } = useAsyncList<Article>(() => fetchArticle(String(route.params.id)))
const article = computed(() => data.value)
const paragraphs = computed(() =>
  (data.value?.content ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
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
      <article class="m-card body">
        <p v-for="(p, i) in paragraphs" :key="i" class="para">{{ p }}</p>
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
