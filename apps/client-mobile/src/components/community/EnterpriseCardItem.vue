<script setup lang="ts">
import { Avatar, Tag } from 'tdesign-mobile-vue'
import type { EnterpriseRecord } from '@/types'

/* 企业库卡片：Logo + 名称 + 等级 + 行业规模 + 简介；有公开名片时整卡可跳转，否则点击提示未发布。 */
defineProps<{ enterprise: EnterpriseRecord; to?: string }>()
defineEmits<{ unavailable: [] }>()
</script>

<template>
  <component
    :is="to ? 'router-link' : 'article'"
    class="enterprise-card m-card pressable"
    :to="to"
    v-pressable="!to"
    @click="!to && $emit('unavailable')"
  >
    <div class="row-head">
      <div class="enterprise-identity">
        <Avatar shape="round" size="44px" :image="enterprise.logo" class="enterprise-logo">
          {{ enterprise.name.slice(0, 1) }}
        </Avatar>
        <h3 class="title name">{{ enterprise.name }}</h3>
      </div>
      <Tag v-if="enterprise.level" size="small" variant="light" theme="primary">
        Lv.{{ enterprise.level }}<template v-if="enterprise.levelName"> {{ enterprise.levelName }}</template>
      </Tag>
    </div>
    <p class="meta">{{ enterprise.industry }} · {{ enterprise.size }}</p>
    <p class="intro">{{ enterprise.description }}</p>
  </component>
</template>

<style scoped>
.enterprise-card {
  display: block;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--app-space-5);
  margin-bottom: var(--app-space-4);
}

.enterprise-identity {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  flex: 1;
  min-width: 0;
}

.enterprise-logo {
  flex-shrink: 0;
  font: var(--app-type-display);
}

.title {
  margin: 0;
  font: var(--app-type-card-title);
  color: var(--td-text-color-primary);
  min-width: 0;
}

.name {
  flex: 1;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.meta {
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.intro {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
