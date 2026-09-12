<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Loading, Tag } from 'tdesign-mobile-vue'
import { fetchEvents } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityEvent } from '@/types'

/* 移动活动列表：类型 chips 横滑 + 关键词 + 纵列卡片；发布活动为管理端能力，不提供入口 */
const router = useRouter()

const TYPE_CHIPS = ['全部', '沙龙', '培训', '路演', '社交']
const activeType = ref('全部')
const keyword = ref('')

const { data, loading, error, run } = useAsyncList<CommunityEvent>(() =>
  fetchEvents({ type: activeType.value === '全部' ? undefined : activeType.value, keyword: keyword.value.trim() || undefined }),
)

onMounted(run)

function pickType(chip: string) {
  activeType.value = chip
  run()
}

function search() {
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

    <Loading v-if="loading" class="state" text="加载中…" />
    <section v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <Button variant="outline" size="small" @click="run">重试</Button>
    </section>
    <EmptyBlock v-else-if="(data ?? []).length === 0" text="暂无符合条件的活动" />
    <div v-else class="event-list stagger">
      <article v-for="ev in data" :key="ev.id" class="event-card m-card" @click="router.push(`/events/${ev.id}`)">
        <div class="event-top">
          <span class="type-tag">{{ ev.typeLabel }}</span>
          <span class="capacity">已报名 {{ ev.approvedCount }}/{{ ev.capacity }}</span>
        </div>
        <h3 class="title">{{ ev.title }}</h3>
        <p class="meta">🕐 {{ ev.startTime }} · 📍 {{ ev.location }}</p>
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
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
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
