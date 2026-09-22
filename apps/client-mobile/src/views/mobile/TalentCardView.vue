<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Icon, Tag, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchTalentCard } from '@/api/community'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { useAuthStore } from '@/stores/auth'
import { shareContent } from '@/utils/share'
import { safeHttpUrl } from '@/utils/validators'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'

/* 公开人才名片（简历式）：人才库点入，展示个人资料头像与全部公开字段。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const uid = String(route.params.uid)
const { data, loading, error, run } = useAsyncList(() => fetchTalentCard(uid))
onMounted(async () => {
  await run()
  await loadFavorite()
})

/* v40：收藏人才名片 */
const favorited = ref(false)
async function loadFavorite() {
  /* 公开路由：游客不请求收藏列表，避免 401 被统一拦截跳登录 */
  if (!auth.isLogged) return
  try {
    const list = await listFavorites()
    favorited.value = list.some((item) => item.type === 'talent' && item.targetId === uid)
  } catch {
    favorited.value = false
  }
}
async function onToggleFavorite() {
  if (!auth.isLogged) {
    Toast('登录后可收藏')
    return
  }
  const next = !favorited.value
  favorited.value = next
  try {
    favorited.value = await toggleFavorite('talent', uid, card.value?.name ?? uid)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    favorited.value = !next
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

const card = computed(() => data.value)

/* 名片链接白名单：过滤 javascript:/data: 等协议（用户自填字段），避免点击即执行脚本 */
const safeLinks = computed(() =>
  [...(card.value?.socials ?? []), ...(card.value?.customLinks ?? [])]
    .map((link) => ({ label: link.label || link.url, url: safeHttpUrl(link.url) }))
    .filter((link): link is { label: string; url: string } => Boolean(link.url)),
)

/* v40：分享人才名片 */
async function onShare() {
  const item = card.value
  if (!item) return
  await shareContent({ title: item.name, text: item.intro })
}
</script>

<template>
  <div class="page-fade-in talent-card-page">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="card">
      <section class="m-card hero">
        <Avatar size="64px" class="avatar" :image="card.avatar">{{ card.name.slice(0, 1) }}</Avatar>
        <div class="hero-info">
          <h2 class="name">{{ card.name }}</h2>
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

      <div class="actions">
        <Button size="small" variant="outline" @click="onToggleFavorite">
          <template #icon><Icon aria-hidden="true" :name="favorited ? 'star-filled' : 'star'" size="16px" /></template>
          {{ favorited ? '已收藏' : '收藏' }}
        </Button>
        <Button size="small" variant="outline" @click="onShare">
          <template #icon><Icon aria-hidden="true" name="share" size="16px" /></template>
          分享
        </Button>
      </div>

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

      <section v-if="safeLinks.length" class="m-card">
        <h3 class="sec-title">链接</h3>
        <a
          v-for="(l, i) in safeLinks"
          :key="i"
          class="link-row"
          :href="l.url"
          target="_blank"
          rel="noopener"
        >
          <span class="link-label">{{ l.label }}</span>
          <Icon aria-hidden="true" name="chevron-right" size="16px" class="link-arrow" />
        </a>
      </section>
    </template>
    <!-- v46：名片不存在时（数据为空且无错误）补兜底出口，避免二级页整页空白成为死胡同 -->
    <EmptyBlock
      v-else
      text="名片不存在或已下架"
      action-text="浏览人才库"
      @action="router.push('/community?tab=talent')"
    />
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
}

.talent-card-page {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.hero {
  display: flex;
  align-items: center;
  gap:var(--app-space-7);
}

.avatar {
  flex-shrink: 0;
  font-size: var(--app-font-title);
  font-weight: 600;
}

.hero-info {
  min-width: 0;
}

.name {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-title);
  font-weight: 600;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.meta-item {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin:0 0 var(--app-space-5);
  font-size: var(--app-font-subtitle);
}

.desc {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-3);
}

.skill {
  margin:0;
}

.entry {
  padding:var(--app-space-5) 0;
  border-bottom: 1px dashed var(--td-component-border);
}

.entry:last-child {
  padding-bottom:0;
  border-bottom: none;
}

.entry-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
}

.entry-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap:var(--app-space-5);
}

.entry-title {
  font-size: var(--app-font-body);
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.entry-role {
  margin-left:var(--app-space-4);
  font-size: var(--app-font-caption);
  font-weight: 400;
  color: var(--td-text-color-secondary);
}

.entry-period {
  flex-shrink: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.entry-sub,
.entry-desc {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-4);
  padding:var(--app-space-5) 0;
  border-bottom: 1px dashed var(--td-component-border);
}

.link-row:last-child {
  padding-bottom:0;
  border-bottom: none;
}

.link-label {
  font-size: var(--app-font-body);
  color: var(--td-brand-color);
}

.link-arrow {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
}
</style>
