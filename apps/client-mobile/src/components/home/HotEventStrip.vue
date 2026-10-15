<script setup lang="ts">
import { Icon } from 'tdesign-mobile-vue'
import CategoryTag from '@/components/shared/CategoryTag.vue'
import type { HomeEventCard } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 首页近期活动：横滑卡片。 */
defineProps<{ events: HomeEventCard[] }>()
</script>

<template>
  <section v-if="events.length" class="block">
    <div class="block-head">
      <h2>近期活动</h2>
      <router-link class="more" to="/plaza?tab=events">更多<Icon aria-hidden="true" name="chevron-right" size="12px" /></router-link>
    </div>
    <div class="hot-scroll">
      <router-link
        v-for="e in events"
        :key="e.id"
        :to="`/events/${e.id}`"
        class="m-card hot-card pressable"
      >
        <CategoryTag class="d-cat" :label="e.type" />
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
  color: var(--app-section-title, var(--td-text-color-primary));
  margin:0;
  font: var(--app-type-section);
}

.more {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
  min-width: 44px;
  min-height: 44px;
  font: var(--app-type-body-sm);
  color: var(--app-theme-link, var(--td-brand-color));
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
  font: var(--app-type-card-title);
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
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* v45：人数上限不是「有人响应」这类有效信号，撤掉品牌色强调 */
.hot-enrolled {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}
</style>
