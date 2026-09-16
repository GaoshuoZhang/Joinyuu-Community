<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Loading, Avatar, Button, DialogPlugin, Tag, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchTalentCard } from '@/api/community'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { blockUser } from '@/api/me'
import { submitReport } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { shareContent } from '@/utils/share'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'

/* 公开人才名片（简历式）：人才库点入，展示个人资料头像与全部公开字段；v38 支持屏蔽用户。 */
const route = useRoute()
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
  try {
    favorited.value = await toggleFavorite('talent', uid, card.value?.name ?? uid, card.value?.role)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

const card = computed(() => data.value)
const blocked = ref(false)

/* v40：分享人才名片 */
async function onShare() {
  const item = card.value
  if (!item) return
  await shareContent({ title: item.name, text: `${item.role} · ${item.intro}` })
}

/* v40：举报用户 */
const reportVisible = ref(false)
const USER_REPORT_REASONS = ['虚假身份', '骚扰 / 辱骂', '违规内容', '广告推广', '其他']

async function onReport(text: string) {
  if (!text) return void Toast('请选择举报原因')
  try {
    await submitReport({ targetType: 'user', targetId: uid, targetTitle: card.value?.name ?? uid, reason: text })
    Toast('举报已提交，运营将核实处理')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '举报提交失败，请稍后重试')
  }
}

function onBlock() {
  if (!auth.isLogged) {
    Toast('请先登录后再屏蔽')
    return
  }
  DialogPlugin.confirm({
    title: '屏蔽该用户',
    content: `屏蔽后你将不再看到「${card.value?.name ?? '该用户'}」的相关内容。`,
    cancelBtn: '取消',
    confirmBtn: '确认屏蔽',
    onConfirm: async () => {
      try {
        await blockUser(uid)
        blocked.value = true
        Toast('已加入屏蔽名单，可在账号与安全中管理')
      } catch (e) {
        Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
      }
    },
  })
}
</script>

<template>
  <div class="page-fade-in talent-card-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
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

      <div class="actions">
        <Button size="small" variant="outline" @click="onToggleFavorite">{{ favorited ? '★ 已收藏' : '☆ 收藏' }}</Button>
        <Button size="small" variant="outline" @click="onShare">分享</Button>
        <Button size="small" variant="outline" @click="reportVisible = true">举报</Button>
        <Button size="small" variant="outline" theme="danger" :disabled="blocked || !auth.isLogged" @click="onBlock">
          {{ blocked ? '已屏蔽' : auth.isLogged ? '屏蔽该用户' : '登录后可屏蔽' }}
        </Button>
      </div>
      <ReasonSheet v-model:visible="reportVisible" title="举报用户" :reasons="USER_REPORT_REASONS" placeholder="补充说明（选填）…" submit-label="提交举报" @submit="onReport" />

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
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

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
