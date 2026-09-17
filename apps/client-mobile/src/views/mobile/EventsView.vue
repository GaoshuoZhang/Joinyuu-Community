<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, Input, Tag } from 'tdesign-mobile-vue'
import { fetchEvents } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { CommunityEvent } from '@/types'

useAnimSuppress()

/* 移动活动列表：类型 chips 横滑 + 关键词 + 纵列卡片；发布活动为管理端能力，不提供入口 */
const route = useRoute()
const router = useRouter()

const TYPE_CHIPS = ['全部', '沙龙', '培训', '路演', '社交']
const initialType = String(route.query.type ?? '')
const activeType = ref(TYPE_CHIPS.includes(initialType) ? initialType : '全部')
const keyword = ref(String(route.query.q ?? ''))

const { data, loading, error, run } = useAsyncList<CommunityEvent>(() =>
  fetchEvents({ type: activeType.value === '全部' ? undefined : activeType.value, keyword: keyword.value.trim() || undefined }),
)

onMounted(run)

/* v38：返回时刷新活动列表 */
useRefreshOnActivate(run)

/* v40：类型/关键词同步 URL */
function syncQuery() {
  const query: Record<string, string> = {}
  if (activeType.value !== '全部') query.type = activeType.value
  if (keyword.value.trim()) query.q = keyword.value.trim()
  const current = route.query as Record<string, string>
  if (current.type === query.type && current.q === query.q) return
  void router.replace({ query })
}

/* v41：外部跳转带来的类型/关键词同步 */
useRouteQuerySync('/events', (q) => {
  const nextType = TYPE_CHIPS.includes(q.type ?? '') ? String(q.type) : '全部'
  const nextKeyword = q.q ?? ''
  if (nextType === activeType.value && nextKeyword === keyword.value) return
  activeType.value = nextType
  keyword.value = nextKeyword
  run()
})

function pickType(chip: string) {
  activeType.value = chip
  syncQuery()
  run()
}

function search() {
  syncQuery()
  run()
}
</script>

<template>
  <div class="m-events page-fade-in">
    <p class="manage-note">ℹ️ 发布活动为管理端能力</p>

    <div class="chips">
      <Tag
        v-for="chip in TYPE_CHIPS"
        :key="chip"
        :theme="activeType === chip ? 'primary' : 'default'"
        variant="light"
        size="medium"
        @click="pickType(chip)"
      >
        {{ chip }}
      </Tag>
    </div>

    <div class="search-row">
      <Input v-model="keyword" class="search-input" placeholder="搜索活动关键词…" @keyup.enter="search" />
      <Button theme="primary" @click="search">搜索</Button>
    </div>

    <ListSkeleton v-if="loading && !(data ?? []).length" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="(data ?? []).length === 0" text="暂无符合条件的活动" />
    <div v-else class="event-list stagger">
      <p class="list-count">共 {{ (data ?? []).length }} 场活动</p>
      <article v-for="ev in data" :key="ev.id" class="event-card m-card" v-pressable @click="router.push(`/events/${ev.id}`)">
        <div class="event-top">
          <Tag class="type-tag" size="small" variant="light" theme="primary">{{ ev.typeLabel }}</Tag>
          <span class="capacity">已报名 {{ ev.approvedCount }}/{{ ev.capacity }}</span>
        </div>
        <h3 class="title">{{ ev.title }}</h3>
        <p class="meta"><Icon name="time" size="14px" />{{ ev.startTime }} · <Icon name="location" size="14px" />{{ ev.location }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-events {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manage-note {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex: 1;
}

.error-box {
  text-align: center;
  color: var(--td-error-color);
  font-size: 12px;
}

.error-box p {
  margin: 0 0 10px;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-card {
  cursor: pointer;
}

.event-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.type-tag {
  flex-shrink: 0;
}

.capacity {
  font-size: 12px;
  color: var(--td-brand-color);
}

.title {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.4;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
