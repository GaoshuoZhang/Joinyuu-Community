<script setup lang="ts">
import { Icon, Tag } from 'tdesign-mobile-vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

export interface FeedMeta {
  text: string
  /** 强调样式（如「N 人响应」） */
  accent?: boolean
}

export interface FeedItem {
  key: string
  title: string
  tag: string
  path: string
  metas: FeedMeta[]
}

/* 首页信息流区块：标题 + 可选「更多」+ 卡片列表（最新需求/最新资讯共用）。 */
defineProps<{ title: string; items: FeedItem[]; emptyText: string; morePath?: string }>()
</script>

<template>
  <section class="block">
    <div class="block-head">
      <h2>{{ title }}</h2>
      <router-link v-if="morePath" class="more" :to="morePath">
        更多<Icon aria-hidden="true" name="chevron-right" size="12px" />
      </router-link>
    </div>
    <EmptyBlock v-if="!items.length" :text="emptyText" />
    <div v-else class="list">
      <router-link
        v-for="item in items"
        :key="item.key"
        :to="item.path"
        class="m-card demand-item pressable"
      >
        <div class="d-head">
          <h3 class="d-title">{{ item.title }}</h3>
          <Tag class="d-cat" size="small" variant="light" theme="primary">{{ item.tag }}</Tag>
        </div>
        <div class="d-meta">
          <span v-for="(meta, index) in item.metas" :key="index" :class="{ 'd-resp': meta.accent }">{{ meta.text }}</span>
        </div>
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
  font-size: var(--app-font-subtitle);
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

.list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.demand-item {
  cursor: pointer;
  color: inherit;
  text-decoration: none;
}

.d-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
}

.d-title {
  margin:0;
  flex: 1;
  min-width: 0;
  font-size: var(--app-font-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-cat {
  flex-shrink: 0;
}

.d-meta {
  display: flex;
  align-items: center;
  gap: var(--app-space-6);
  margin-top: var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.d-meta > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-meta > .d-resp {
  flex-shrink: 0;
}

.d-resp {
  margin-left:auto;
  font-variant-numeric: tabular-nums;
  color: var(--td-brand-color);
  font-weight: 600;
}
</style>
