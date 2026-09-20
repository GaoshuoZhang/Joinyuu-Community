<script setup lang="ts">
import { Avatar, Tag } from 'tdesign-mobile-vue'
import type { TalentMember } from '@/types'

/* 人才库卡片：头像 + 姓名 + 角色 + 简介 + 技能标签。 */
defineProps<{ talent: TalentMember; to: string }>()
</script>

<template>
  <router-link class="talent-card m-card pressable" :to="to">
    <div class="row-head">
      <span class="talent-name">
        <Avatar size="40px" :image="talent.avatar" class="talent-avatar">{{ talent.name.slice(0, 1) }}</Avatar>
        <h3 class="title name">{{ talent.name }}</h3>
      </span>
      <Tag v-if="talent.role" class="role-tag" size="small" variant="light" theme="primary">{{ talent.role }}</Tag>
    </div>
    <p class="intro">{{ talent.intro }}</p>
    <div v-if="talent.skills.length" class="skills">
      <Tag v-for="s in talent.skills" :key="s" size="small" variant="light" theme="default" class="skill">
        {{ s }}
      </Tag>
    </div>
  </router-link>
</template>

<style scoped>
.talent-card {
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

.talent-name {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  min-width: 0;
}

.talent-avatar {
  flex-shrink: 0;
  font-size: var(--app-font-subtitle);
}

.role-tag {
  flex-shrink: 0;
}

.title {
  margin:0;
  font-size: var(--app-font-subtitle);
  font-weight: 600;
  line-height: 1.45;
  color: var(--td-text-color-primary);
  min-width: 0;
}

.name {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.intro {
  margin: var(--app-space-3) 0 0;
  font-size: var(--app-font-body);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-3);
}

.skill {
  margin:0;
}
</style>
