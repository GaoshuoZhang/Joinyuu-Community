<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchMyResponses } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyResponses)

onMounted(run)

const items = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(items)
</script>

<template>
  <div class="m-my-responses page-fade-in">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无响应记录，去需求广场看看适合你的合作机会" action-text="浏览需求" @action="router.push('/projects')" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ formatZhNumber(items.length) }} 条</p>
      <article
        v-for="r in visibleItems"
        :key="r.id"
        class="resp-row m-card"
        role="link"
        tabindex="0"
        @click="router.push(`/demands/${r.demandId}`)"
        @keydown.enter.self="router.push(`/demands/${r.demandId}`)"
      >
        <h2 class="row-title">{{ r.demandTitle }}</h2>
        <p class="row-note">{{ r.note }}</p>
        <p v-if="r.status" class="row-status">
          <StateTag kind="response" :value="r.status ?? 'pending'" />
          <span v-if="r.rejectReason">{{ r.rejectReason }}</span>
        </p>
        <p class="row-at">响应于 {{ formatLocalDateTime(r.at) }}</p>
      </article>
      <Button v-if="hasMore" block variant="outline" @click="showMore">加载更多（剩余 {{ formatZhNumber(items.length - visibleItems.length) }} 条）</Button>
    </div>
  </div>
</template>

<style scoped>
.m-my-responses {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.row-title {
  margin: 0;
  font-size: var(--app-font-body);
  line-height: 1.45;
}

.resp-row { cursor: pointer; }
.resp-row:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }

.row-note {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.row-at {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.row-status {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}
</style>
