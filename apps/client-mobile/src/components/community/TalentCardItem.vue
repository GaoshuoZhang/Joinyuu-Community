<script setup lang="ts">
import { Avatar, Tag } from 'tdesign-mobile-vue'
import LevelTag from '@/components/shared/LevelTag.vue'
import type { TalentMember } from '@/types'

/* 人才库卡片：头像 + 姓名 + 等级标签 + 简介 + 技能标签。
 * v46：移除自造的「角色」主属性标签——人才主属性口径统一为「等级」（与企业库列表同源展示）。
 * v53：等级标签改用 LevelTag（主题等级配色）。 */
defineProps<{ talent: TalentMember; to: string }>()
</script>

<template>
  <router-link class="talent-card m-card pressable" :to="to">
    <div class="row-head">
      <span class="talent-name">
        <Avatar size="40px" :image="talent.avatar" class="talent-avatar">{{ talent.name.slice(0, 1) }}</Avatar>
        <h3 class="title name">{{ talent.name }}</h3>
      </span>
      <LevelTag v-if="talent.level != null" class="level-tag" :level="talent.level" :name="talent.levelName" />
    </div>
    <p class="intro" :class="{ 'empty-intro': !talent.intro?.trim() }">{{ talent.intro?.trim() || '该成员暂未填写简介' }}</p>
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
  font: var(--app-type-display);
  /* 未上传头像时用浅品牌底 + 深蓝首字（v53）；有头像时图片铺满，该底色不可见 */
  --td-avatar-bg-color: var(--app-avatar-fallback-bg);
  --td-avatar-content-color: var(--app-avatar-fallback-text);
}

/* 等级标签不被长姓名压缩（姓名侧已有 min-width:0 + 省略号） */
.level-tag {
  flex-shrink: 0;
}

.title {
  margin:0;
  font: var(--app-type-card-title);
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
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty-intro {
  color: var(--td-text-color-placeholder);
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
