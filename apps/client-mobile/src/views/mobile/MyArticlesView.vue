<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, List, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { fetchMyArticles, withdrawArticle } from '@/api/contents'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MySubmittedArticle } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动我的投稿：状态标签 + 驳回原因；审核中可撤回，驳回/撤回后可修改重提；空态引导去投稿 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList<MySubmittedArticle[]>(fetchMyArticles)

const items = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(items)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
const empty = computed(() => !loading.value && !error.value && items.value.length === 0)

function onRevise(a: MySubmittedArticle) {
  void router.push(`/articles/new?revise=${a.id}`)
}

function onWithdraw(a: MySubmittedArticle) {
  DialogPlugin.confirm({
    title: '撤回投稿',
    content: `撤回后「${a.title}」将不再进入审核，可在列表中修改重提。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      try {
        await withdrawArticle(a.id)
        Toast('已撤回投稿')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-my-articles">
    <header class="page-header head">
      <div v-if="!empty" class="page-header-actions">
        <Button theme="primary" size="small" @click="router.push('/articles/new')">去投稿</Button>
      </div>
    </header>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="empty">
      <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同（单一主入口，不再叠加同义 CTA） -->
      <EmptyBlock text="还没有投稿，去写一篇吧" />
      <Button theme="primary" block @click="router.push('/articles/new')">去投稿</Button>
    </template>
    <List v-else class="stagger list" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
      <p class="list-count">共 {{ formatZhNumber(items.length) }} 篇</p>
      <section
        v-for="a in visibleItems"
        :key="a.id"
        class="m-card item record-card"
        role="link"
        tabindex="0"
        @click="router.push(`/me/articles/${a.id}`)"
        @keydown.enter.self="router.push(`/me/articles/${a.id}`)"
      >
        <header class="row">
          <h3 class="title">{{ a.title }}</h3>
          <StateTag kind="article" :value="a.status" />
        </header>
        <p class="meta">{{ a.columnLabel }} · 提交于 {{ formatLocalDateTime(a.submittedAt) }}</p>
        <p v-if="a.status === 'rejected'" class="reject">驳回原因：{{ a.rejectReason ?? '未填写' }}</p>
        <div v-if="a.status === 'pending' || a.status === 'rejected' || a.status === 'withdrawn'" class="ops">
          <Button v-if="a.status === 'pending'" size="small" variant="outline" @click.stop="onWithdraw(a)">撤回</Button>
          <Button
            v-if="a.status === 'rejected' || a.status === 'withdrawn'"
            size="small"
            theme="primary"
            variant="outline"
            @click.stop="onRevise(a)"
          >
            修改重提
          </Button>
        </div>
      </section>
    </List>
  </div>
</template>

<style scoped>
.m-my-articles {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.head { justify-content: flex-end; }

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.record-card { cursor: pointer; }
.record-card:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }

.row {
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-5);
}

.title {
  flex: 1;
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.4;
  min-width: 0;
}

.meta {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.reject {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.ops {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}
</style>
