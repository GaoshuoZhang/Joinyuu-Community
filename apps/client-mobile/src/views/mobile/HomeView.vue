<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon, Button, Grid, GridItem, Loading, Search, Swiper, SwiperItem } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchHomeFeed } from '@/api/home'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { demandDateText } from '@/constants/demand'

/* 首页（社区运营入口导向，2026-09-13 重构）：
 * 搜索框 → 站点标语 → 轮播 → 需求发布 → 双入口(企业合作/人才登记) → 四宫格(文章投稿/积分商城/空间预约/活动计划)
 * → 进行中活动（横滑） → 最新项目 → 精选文章。 */
const router = useRouter()
const config = useConfigStore()
const auth = useAuthStore()
const notices = useNoticesStore()
const { data: feed, loading, error, run } = useAsyncList(fetchHomeFeed)

onMounted(() => {
  config.ensureLoaded()
  run()
})

/* 铃铛未读角标：登录态以首页聚合未读数初始化（AppShell 冷启动另有轻量兜底刷新） */
watch(feed, (f) => {
  if (f && auth.isLogged) notices.setUnread(f.noticesUnread)
})

const searchKeyword = ref('')

/* 首页搜索直达跨域搜索页，保留关键词以便用户继续检索。 */
function onSearch() {
  void router.push({ path: '/search', query: searchKeyword.value.trim() ? { q: searchKeyword.value.trim() } : undefined })
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
  { path: '/intros/enterprise', icon: 'usergroup', label: '企业合作', desc: '入驻或成为伙伴' },
  { path: '/intros/talent', icon: 'app', label: '人才登记', desc: '让企业找到你' },
] as const

const quickEntries = [
  { path: '/articles/new', icon: 'edit-1', label: '文章投稿' },
  { path: '/mall', icon: 'shop', label: '积分商城' },
  { path: '/spaces', icon: 'building', label: '空间预约' },
  { path: '/events', icon: 'calendar', label: '活动计划' },
] as const
</script>

<template>
  <div class="home page-fade-in">
    <!-- 顶部搜索：进入全局搜索页，覆盖项目、活动、文章与社区内容 -->
    <Search v-model="searchKeyword" placeholder="搜索项目、活动、文章或社区服务" @focus="onSearch" @search="onSearch" />

    <p v-if="feed?.siteSlogan" class="home-slogan">{{ feed.siteSlogan }}</p>

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

      <!-- 需求发布（独占一行，主题主色） -->
      <Button theme="primary" block size="large" class="publish-entry pressable" @click="goPublish">
        <template #icon><Icon name="flag" size="20px" /></template>
        发布需求 · 让社区一起帮你完成 ›
      </Button>

      <!-- 两个重要快捷入口 -->
      <Grid :column="2" :gutter="10" hover class="feature-grid stagger">
        <GridItem
          v-for="f in featureEntries"
          :key="f.path"
          class="feature-item"
          @click="router.push(f.path)"
        >
          <template #image><Icon :name="f.icon" size="22px" /></template>
          <template #text><span class="feature-label">{{ f.label }}</span></template>
          <template #description><span class="feature-desc">{{ f.desc }}</span></template>
        </GridItem>
      </Grid>

      <!-- 四个普通快捷入口 -->
      <Grid :column="4" :gutter="8" hover class="quick-grid stagger">
        <GridItem v-for="q in quickEntries" :key="q.path" class="quick-item" @click="router.push(q.path)">
          <template #image><span class="quick-icon"><Icon :name="q.icon" size="22px" /></span></template>
          <template #text>{{ q.label }}</template>
        </GridItem>
      </Grid>

      <!-- 进行中活动（横滑卡片） -->
      <section class="block">
        <div class="block-head">
          <h2>进行中活动</h2>
          <a class="more" @click="router.push('/events')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.hotEvents ?? []).length" text="暂无进行中活动" />
        <div v-else class="hot-scroll">
          <article
            v-for="e in feed.hotEvents"
            :key="e.id"
            class="m-card hot-card pressable"
            @click="router.push(`/events/${e.id}`)"
          >
            <span class="d-cat">{{ e.type }}</span>
            <h3 class="hot-title">{{ e.title }}</h3>
            <p class="hot-meta">🕐 {{ e.startTime }}</p>
            <p class="hot-meta">📍 {{ e.location }}</p>
            <p class="hot-enrolled">{{ e.enrolled }}/{{ e.capacity }} 人已报名</p>
          </article>
        </div>
      </section>

      <!-- 最新项目 -->
      <section class="block">
        <div class="block-head">
          <h2>最新项目</h2>
          <a class="more" @click="router.push('/projects')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.latestDemands ?? []).length" text="暂无进行中的项目" />
        <div v-else class="list">
          <article v-for="d in feed.latestDemands" :key="d.id" class="m-card demand-item pressable" @click="router.push(`/demands/${d.id}`)">
            <div class="d-head">
              <h3 class="d-title">{{ d.title }}</h3>
              <span class="d-cat">{{ d.categoryLabel }}</span>
            </div>
            <div class="d-meta">
              <span class="d-pub">{{ d.publisherName }}</span>
              <span v-if="demandDateText(d)">{{ demandDateText(d) }}</span>
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
          <article v-for="a in feed.topArticles" :key="a.id" class="m-card article-item pressable" @click="router.push(`/articles/${a.id}`)">
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
  padding: 16px;
}

.state {
  padding: 32px 0;
}

.banner {
  border-radius: var(--td-radius-large);
  overflow: hidden;
}

.banner-card {
  position: relative;
  height: 130px;
  padding: 22px 20px;
  color: var(--td-text-color-anti);
  overflow: hidden;
}

/* 氛围装饰：半透明白圆环，呼应 admin login 品牌区语言 */
.banner-card::before,
.banner-card::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  pointer-events: none;
}

.banner-card::before {
  width: 150px;
  height: 150px;
  right: -40px;
  bottom: -70px;
}

.banner-card::after {
  width: 84px;
  height: 84px;
  right: 62px;
  bottom: -24px;
  border-style: dashed;
  opacity: 0.8;
}

.banner-title {
  position: relative;
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 700;
}

.banner-sub {
  position: relative;
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}

.home-slogan {
  margin: -4px 2px 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 进行中活动：横向滑动卡片 */
.hot-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.hot-scroll::-webkit-scrollbar {
  display: none;
}

.hot-card {
  flex: 0 0 76%;
  cursor: pointer;
}

.hot-title {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hot-meta {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.hot-enrolled {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--td-brand-color);
}

/* 双入口卡：GridItem 覆盖为品牌渐变色卡；清掉 Grid 根 gutter padding，使网格与卡片边缘对齐 */
.feature-grid {
  padding: 0 !important;
  --td-grid-item-bg-color: transparent;
}

.feature-item {
  --td-grid-item-bg-color: transparent;
  --td-grid-item-image-bg-color: transparent;

  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  box-shadow: var(--td-shadow-1);
  color: var(--td-text-color-anti);
  text-align: left;
  padding: 14px 12px;
}

.feature-item :deep(.t-grid-item__content) {
  align-items: flex-start;
}

.feature-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--td-text-color-anti);
}

.feature-desc {
  font-size: 12px;
  opacity: 0.85;
  color: var(--td-text-color-anti);
}

/* 四宫格：白底卡片项 + 品牌浅底图标气泡；同样清掉根 padding 对齐卡片边缘 */
.quick-grid {
  padding: 0 !important;
  --td-grid-item-bg-color: var(--td-bg-color-container);
}

.quick-item {
  --td-grid-item-image-bg-color: transparent;

  border-radius: var(--td-radius-large);
  border: 1px solid var(--td-component-border);
  overflow: hidden;
}

.quick-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--td-radius-circle);
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
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
  border-radius: var(--td-radius-small);
  font-size: 12px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.d-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.d-resp {
  margin-left: auto;
  color: var(--td-brand-color);
  font-weight: 600;
}
</style>
