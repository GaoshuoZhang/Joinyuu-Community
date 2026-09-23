<script setup lang="ts">
import { Icon, Tag } from 'tdesign-mobile-vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { HomeEventCard } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 首页近期活动：横滑卡片。 */
defineProps<{ events: HomeEventCard[] }>()
</script>

<template>
  <section class="block">
    <div class="block-head">
      <h2>近期活动</h2>
      <router-link class="more" to="/plaza?tab=events">更多<Icon aria-hidden="true" name="chevron-right" size="12px" /></router-link>
    </div>
    <EmptyBlock v-if="!events.length" text="暂无近期活动" />
    <div v-else class="hot-scroll">
      <router-link
        v-for="e in events"
        :key="e.id"
        :to="`/events/${e.id}`"
        class="m-card hot-card pressable"
      >
        <Tag class="d-cat" size="small" variant="light" theme="primary">{{ e.type }}</Tag>
        <h3 class="hot-title">{{ e.title }}</h3>
        <p class="hot-meta"><Icon aria-hidden="true" name="time" size="13px" />{{ formatLocalDateTime(e.startTime) }}</p>
        <p class="hot-meta"><Icon aria-hidden="true" name="location" size="13px" />{{ e.location }}</p>
        <p class="hot-enrolled">限 {{ formatZhNumber(e.capacity) }} 人参加</p>
      </router-link>
    </div>
  </section>
</template>

<style scoped>
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--app-space-5);
}

.block-head h2 {
  margin:0;
  font-size: var(--app-font-title);
  font-weight: 600;
  line-height: 1.4;
}

.more {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  min-width: 44px;
  min-height: 44px;
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
  text-decoration: none;
  cursor: pointer;
}

.d-cat {
  flex-shrink: 0;
}

/* 近期活动：横向滑动卡片 */
.hot-scroll {
  display: flex;
  gap: var(--app-space-5);
  overflow-x: auto;
  padding-bottom: var(--app-space-2);
  scrollbar-width: none;
}

.hot-scroll::-webkit-scrollbar {
  display: none;
}

.hot-card {
  flex: 0 0 76%;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.hot-title {
  margin: var(--app-space-4) 0;
  font-size: var(--app-font-subtitle);
  font-weight: 600;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hot-meta {
  margin: 0 0 var(--app-space-2);
  display: flex;
  align-items: center;
  gap:var(--app-space-2);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

/* v45：人数上限不是「有人响应」这类有效信号，撤掉品牌色强调 */
.hot-enrolled {
  margin: var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}
</style>
