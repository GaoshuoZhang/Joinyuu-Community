<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchMyArticles } from '@/api/contents'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MySubmittedArticle } from '@/types'

/* 移动我的投稿：状态标签 + 驳回原因（红字，可再投稿）；空态引导去投稿 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList<MySubmittedArticle[]>(fetchMyArticles)

const items = computed(() => data.value ?? [])
const empty = computed(() => !loading.value && !error.value && items.value.length === 0)

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-my-articles">
    <header class="page-header head">
      <h2 class="page-title">我的投稿</h2>
      <div v-if="!empty" class="page-header-actions">
        <Button theme="primary" size="small" @click="router.push('/articles/new')">去投稿</Button>
      </div>
    </header>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="empty">
      <EmptyBlock text="还没有投稿，去写一篇吧" />
      <Button theme="primary" block @click="router.push('/articles/new')">去投稿</Button>
    </template>
    <div v-else class="stagger list">
      <section v-for="a in items" :key="a.id" class="m-card item">
        <header class="row">
          <h3 class="title">{{ a.title }}</h3>
          <StateTag kind="article" :value="a.status" />
        </header>
        <p class="meta">{{ a.columnLabel }} · 提交于 {{ a.submittedAt }}</p>
        <template v-if="a.status === 'rejected'">
          <p class="reject">驳回原因：{{ a.rejectReason ?? '未填写' }}</p>
          <p class="hint">修改后可再次投稿</p>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.m-my-articles {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head .page-title {
  margin: 0;
  font-size: 18px;
}

.state {
  padding: 20px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
}

.meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.reject {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.hint {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
