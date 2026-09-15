<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Avatar, Loading, Tag } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchTalentCard } from '@/api/community'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 公开人才名片（简历式）：人才库点入，展示个人资料头像与全部公开字段 */
const route = useRoute()
const uid = String(route.params.uid)
const { data, loading, error, run } = useAsyncList(() => fetchTalentCard(uid))
onMounted(run)

const card = computed(() => data.value)
</script>

<template>
  <div class="page-fade-in talent-card-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="card">
      <section class="m-card hero">
        <Avatar size="64px" class="avatar" :image="card.avatar">{{ card.name.slice(0, 1) }}</Avatar>
        <div class="hero-info">
          <h1 class="name">{{ card.name }}</h1>
          <div class="meta">
            <Tag v-if="card.levelName" size="small" variant="light" theme="primary">Lv.{{ card.level }} {{ card.levelName }}</Tag>
            <span v-if="card.age" class="meta-item">{{ card.age }} 岁</span>
            <span v-if="card.politicalStatus" class="meta-item">{{ card.politicalStatus }}</span>
          </div>
        </div>
      </section>

      <section class="m-card">
        <h3 class="sec-title">个人简介</h3>
        <p class="desc">{{ card.intro }}</p>
      </section>

      <section v-if="card.skills.length" class="m-card">
        <h3 class="sec-title">相关技能</h3>
        <div class="skills">
          <Tag v-for="s in card.skills" :key="s" size="small" variant="light" theme="primary" class="skill">{{ s }}</Tag>
        </div>
      </section>

      <section v-if="card.industryExperience" class="m-card">
        <h3 class="sec-title">行业经验</h3>
        <p class="desc">{{ card.industryExperience }}</p>
      </section>

      <section v-if="card.education.length" class="m-card">
        <h3 class="sec-title">教育经历</h3>
        <div v-for="(e, i) in card.education" :key="i" class="entry">
          <div class="entry-head">
            <span class="entry-title">{{ e.school }}</span>
            <span v-if="e.period" class="entry-period">{{ e.period }}</span>
          </div>
          <p v-if="e.major || e.degree" class="entry-sub">{{ [e.major, e.degree].filter(Boolean).join(' · ') }}</p>
        </div>
      </section>

      <section v-if="card.work.length" class="m-card">
        <h3 class="sec-title">工作经历</h3>
        <div v-for="(w, i) in card.work" :key="i" class="entry">
          <div class="entry-head">
            <span class="entry-title">{{ w.company }}<span v-if="w.title" class="entry-role">{{ w.title }}</span></span>
            <span v-if="w.period" class="entry-period">{{ w.period }}</span>
          </div>
          <p v-if="w.description" class="entry-desc">{{ w.description }}</p>
        </div>
      </section>

      <section v-if="card.projects.length" class="m-card">
        <h3 class="sec-title">项目经历</h3>
        <div v-for="(p, i) in card.projects" :key="i" class="entry">
          <div class="entry-head">
            <span class="entry-title">{{ p.name }}<span v-if="p.role" class="entry-role">{{ p.role }}</span></span>
            <span v-if="p.period" class="entry-period">{{ p.period }}</span>
          </div>
          <p v-if="p.description" class="entry-desc">{{ p.description }}</p>
        </div>
      </section>

      <section v-if="card.honors.length" class="m-card">
        <h3 class="sec-title">荣誉证书</h3>
        <div v-for="(h, i) in card.honors" :key="i" class="entry entry-line">
          <span class="entry-title">{{ h.name }}</span>
          <span v-if="h.date" class="entry-period">{{ h.date }}</span>
        </div>
      </section>

      <section v-if="card.socials.length || card.customLinks.length" class="m-card">
        <h3 class="sec-title">链接</h3>
        <a
          v-for="(l, i) in [...card.socials, ...card.customLinks]"
          :key="i"
          class="link-row"
          :href="l.url"
          target="_blank"
          rel="noopener"
        >
          <span class="link-label">{{ l.label || l.url }}</span>
          <span class="link-arrow">›</span>
        </a>
      </section>
    </template>
  </div>
</template>

<style scoped>
.talent-card-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.hero {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar {
  flex-shrink: 0;
  font-size: 24px;
  font-weight: 700;
}

.hero-info {
  min-width: 0;
}

.name {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-item {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin: 0 0 10px;
  font-size: 15px;
}

.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skill {
  margin: 0;
}

.entry {
  padding: 10px 0;
  border-bottom: 1px dashed var(--td-component-border);
}

.entry:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.entry-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.entry-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.entry-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.entry-role {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--td-text-color-secondary);
}

.entry-period {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.entry-sub,
.entry-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px dashed var(--td-component-border);
}

.link-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.link-label {
  font-size: 13px;
  color: var(--td-brand-color);
}

.link-arrow {
  color: var(--td-text-color-placeholder);
}
</style>
