<script setup lang="ts">
import { Icon, Tag } from 'tdesign-mobile-vue'

export interface FeedMeta {
  text: string
  /** 强调样式（如「N 人响应」） */
  accent?: boolean
}

export interface FeedItem {
  key: string
  title: string
  tag: string
  tagMeta?: FeedMeta
  path: string
  metas: FeedMeta[]
}

/* 首页信息流区块：标题 + 可选「更多」+ 卡片列表（最新需求/最新资讯共用）。 */
defineProps<{ title: string; items: FeedItem[]; morePath?: string }>()
</script>

<template>
  <section v-if="items.length" class="block">
    <div class="block-head">
      <h2>{{ title }}</h2>
      <router-link v-if="morePath" class="more" :to="morePath">
        更多<Icon aria-hidden="true" name="chevron-right" size="12px" />
      </router-link>
    </div>
    <!-- v46：与首页其它区块、其它列表页一致，使用约定的 .stagger 交错载入 -->
    <div class="list stagger">
      <router-link
        v-for="item in items"
        :key="item.key"
        :to="item.path"
        class="m-card demand-item pressable"
      >
        <div class="d-head">
          <Tag class="d-cat" size="small" variant="light" theme="primary">{{ item.tag }}</Tag>
          <span v-if="item.tagMeta" class="d-tag-meta" :class="{ 'd-resp': item.tagMeta.accent }">{{ item.tagMeta.text }}</span>
        </div>
        <h3 class="d-title">{{ item.title }}</h3>
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
  flex-wrap: wrap;
  gap: var(--app-space-4);
  margin-bottom: var(--app-space-4);
}

.d-title {
  margin:0;
  flex: 1;
  min-width: 0;
  font: var(--app-type-card-title);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.d-cat {
  flex-shrink: 0;
  align-self: flex-start;
}

.d-tag-meta {
  min-width: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
}

.d-tag-meta.d-resp {
  color: var(--app-theme-link, var(--td-brand-color));
  font: var(--app-type-emphasis-sm);
  font-variant-numeric: tabular-nums;
}

.d-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--app-space-6);
  row-gap: var(--app-space-3);
  margin-top: var(--app-space-4);
  font: var(--app-type-caption);
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

/* Emphasized metadata stays distinct from secondary publisher and date details. */
.d-resp {
  color: var(--app-theme-link, var(--td-brand-color));
}
</style>
