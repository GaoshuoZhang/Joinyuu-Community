<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Loading, Tag } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchArticles, fetchColumns } from '@/api/contents'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { Article, ArticleColumn } from '@/types'

/* 移动文章列表：栏目 chips 横滑 + 关键词检索 + 纵列文章卡；登录后显示投稿入口 */
const router = useRouter()
const auth = useAuthStore()

const { data: columnData, run: loadColumns } = useAsyncList<ArticleColumn[]>(fetchColumns)
const keyword = ref('')
const activeColumn = ref('')
const { data: articleData, loading, error, run: loadArticles } = useAsyncList<Article[]>(() =>
  fetchArticles({ column: activeColumn.value || undefined, keyword: keyword.value.trim() || undefined }),
)

const columns = computed(() => columnData.value ?? [])
const articles = computed(() => articleData.value ?? [])
const empty = computed(() => !loading.value && !error.value && articles.value.length === 0)

onMounted(() => {
  loadColumns()
  loadArticles()
})

function pickColumn(label: string) {
  activeColumn.value = label
  loadArticles()
}
</script>

<template>
  <div class="page-fade-in m-articles">
    <header class="page-filter-bar toolbar">
      <div class="chips">
        <Tag
          class="chip"
          size="medium"
          :theme="activeColumn === '' ? 'primary' : 'default'"
          variant="light"
          @click="pickColumn('')"
        >
          全部
        </Tag>
        <Tag
          v-for="c in columns"
          :key="c.code"
          class="chip"
          size="medium"
          :theme="activeColumn === c.label ? 'primary' : 'default'"
          variant="light"
          @click="pickColumn(c.label)"
        >
          {{ c.label }}
        </Tag>
      </div>
      <div class="search-row">
        <Input v-model="keyword" class="search-input" placeholder="搜索文章标题…" enterkeyhint="search" clearable />
        <Button theme="primary" size="small" @click="loadArticles">查询</Button>
        <Button v-if="auth.isLogged" theme="primary" variant="outline" size="small" @click="router.push('/articles/new')">投稿</Button>
      </div>
    </header>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="empty" text="暂无相关文章" />
    <div v-else class="stagger list">
      <article v-for="a in articles" :key="a.id" class="m-card item" @click="router.push(`/articles/${a.id}`)">
        <span class="col-tag">{{ a.columnLabel }}</span>
        <p class="title">{{ a.title }}</p>
        <p class="summary">{{ a.summary }}</p>
        <p class="meta">{{ a.authorName }} · {{ a.publishedAt }} · {{ a.views }} 次浏览</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-articles {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.toolbar {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 0;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
}

.state {
  padding: 20px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  cursor: pointer;
}

.col-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.title {
  margin: 8px 0 4px;
  font-size: 14px;
  line-height: 1.4;
}

.summary {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
