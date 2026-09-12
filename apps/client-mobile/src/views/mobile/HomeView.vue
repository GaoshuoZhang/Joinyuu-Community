<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Input, Loading, Swiper, SwiperItem, Toast } from 'tdesign-mobile-vue'
import { useConfigStore } from '@/stores/config'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchHomeFeed } from '@/api/home'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 首页（社区运营入口导向，2026-09-13 重构）：
 * 搜索框 → 轮播 → 需求发布 → 双入口(企业入驻/人才登记) → 四宫格(文章投稿/积分商城/空间预约/活动计划)
 * → 最新项目 → 精选文章。 */
const router = useRouter()
const config = useConfigStore()
const { data: feed, loading, error, run } = useAsyncList(fetchHomeFeed)
const keyword = ref('')

onMounted(() => {
  config.ensureLoaded()
  run()
})

function onSearch() {
  const kw = keyword.value.trim()
  if (!kw) {
    Toast('请输入要搜索的关键词')
    return
  }
  void router.push({ path: '/projects', query: { keyword: kw } })
}

const bannerLinks: Record<string, string> = {
  BN1: '/intros/enterprise',
  BN2: '/events',
  BN3: '/mall',
}

function onBannerClick(index: number) {
  const b = feed.value?.banners?.[index]
  if (b?.id && bannerLinks[b.id]) void router.push(bannerLinks[b.id])
}

function goPublish() {
  void router.push('/demands/new')
}

const featureEntries = [
  { path: '/intros/enterprise', icon: '🏢', label: '企业入驻', desc: '共享工位与资源' },
  { path: '/intros/talent', icon: '🧑‍💻', label: '人才登记', desc: '让企业找到你' },
] as const

const quickEntries = [
  { path: '/articles/new', icon: '✍️', label: '文章投稿' },
  { path: '/mall', icon: '🎁', label: '积分商城' },
  { path: '/spaces', icon: '🪑', label: '空间预约' },
  { path: '/events', icon: '📅', label: '活动计划' },
] as const
</script>

<template>
  <div class="home page-fade-in">
    <!-- 顶部搜索 -->
    <div class="search-bar">
      <Input v-model="keyword" placeholder="搜索项目 / 需求" clearable @enter="onSearch" />
      <button class="search-btn" type="button" @click="onSearch">搜索</button>
    </div>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />

    <template v-else>
      <!-- 轮播 -->
      <Swiper v-if="feed?.banners?.length" class="banner" :height="130" :loop="true" :autoplay="true" :interval="4500" @click="onBannerClick">
        <SwiperItem v-for="b in feed.banners" :key="b.id">
          <div class="banner-card" :style="{ background: 'var(--client-brand-gradient)' }">
            <p class="banner-title">{{ b.title }}</p>
            <p class="banner-sub">{{ b.subtitle }}</p>
          </div>
        </SwiperItem>
      </Swiper>

      <!-- 需求发布（独占一行） -->
      <button class="publish-entry" type="button" @click="goPublish">
        <span class="pe-icon">📣</span>
        <span class="pe-text">发布需求 · 让社区一起帮你完成</span>
        <span class="pe-arrow">›</span>
      </button>

      <!-- 两个重要快捷入口 -->
      <div class="feature-grid stagger">
        <button v-for="f in featureEntries" :key="f.path" class="feature-card" type="button" @click="router.push(f.path)">
          <span class="feature-icon">{{ f.icon }}</span>
          <span class="feature-label">{{ f.label }}</span>
          <span class="feature-desc">{{ f.desc }}</span>
        </button>
      </div>

      <!-- 四个普通快捷入口 -->
      <div class="quick-grid stagger">
        <button v-for="q in quickEntries" :key="q.path" class="quick-card" type="button" @click="router.push(q.path)">
          <span class="quick-icon">{{ q.icon }}</span>
          <span class="quick-label">{{ q.label }}</span>
        </button>
      </div>

      <!-- 最新项目 -->
      <section class="block">
        <div class="block-head">
          <h2>最新项目</h2>
          <a class="more" @click="router.push('/projects')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.latestDemands ?? []).length" text="暂无进行中的项目" />
        <div v-else class="list">
          <article v-for="d in feed.latestDemands" :key="d.id" class="m-card demand-item" @click="router.push(`/demands/${d.id}`)">
            <div class="d-head">
              <h3 class="d-title">{{ d.title }}</h3>
              <span class="d-cat">{{ d.categoryLabel }}</span>
            </div>
            <div class="d-meta">
              <span class="d-pub">{{ d.publisherName }}</span>
              <span>截止 {{ d.deadline }}</span>
              <span class="d-resp">{{ d.responseCount }} 人响应</span>
            </div>
          </article>
        </div>
      </section>

      <!-- 精选文章 -->
      <section class="block">
        <div class="block-head">
          <h2>精选文章</h2>
          <a class="more" @click="router.push('/articles')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.topArticles ?? []).length" text="暂无精选文章" />
        <div v-else class="list">
          <article v-for="a in feed.topArticles" :key="a.id" class="m-card article-item" @click="router.push(`/articles/${a.id}`)">
            <div class="d-head">
              <h3 class="d-title">{{ a.title }}</h3>
              <span class="d-cat">{{ a.columnLabel }}</span>
            </div>
            <div class="d-meta">
              <span>{{ a.publishedAt }}</span>
              <span>{{ a.views }} 次浏览</span>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 8px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-btn {
  flex-shrink: 0;
  border: none;
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  font-size: 13px;
  padding: 9px 16px;
}

.state {
  padding: 32px 0;
}

.banner {
  border-radius: var(--td-radius-medium);
  overflow: hidden;
}

.banner-card {
  height: 130px;
  padding: 22px 20px;
  color: var(--td-text-color-anti);
}

.banner-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
}

.banner-sub {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}

.publish-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--td-radius-medium);
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  border: none;
  font-size: 14px;
}

.pe-icon {
  font-size: 18px;
}

.pe-text {
  flex: 1;
  text-align: left;
  font-weight: 600;
}

.feature-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.feature-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 14px;
  border: none;
  border-radius: var(--td-radius-medium);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  text-align: left;
}

.feature-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.feature-label {
  font-size: 15px;
  font-weight: 700;
}

.feature-desc {
  font-size: 11px;
  opacity: 0.85;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.quick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
}

.quick-icon {
  font-size: 20px;
}

.quick-label {
  font-size: 11px;
  color: var(--td-text-color-primary);
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.block-head h2 {
  margin: 0;
  font-size: 16px;
}

.more {
  font-size: 12px;
  color: var(--td-brand-color);
  cursor: pointer;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.demand-item {
  cursor: pointer;
}

.d-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.d-title {
  margin: 0;
  flex: 1;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-cat {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.d-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.d-resp {
  margin-left: auto;
  color: var(--td-brand-color);
  font-weight: 600;
}
</style>