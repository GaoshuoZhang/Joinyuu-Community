<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Icon, Button, Grid, GridItem, NoticeBar, Popup, PullDownRefresh, Search, Swiper, SwiperItem, Toast } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { useAsyncList } from '@/composables/useAsyncList'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { fetchHomeFeed } from '@/api/home'
import { fetchMyDemands, fetchMyResponses } from '@/api/demands'
import { fetchMyEnrollments } from '@/api/events'
import { fetchMe } from '@/api/me'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { demandDateText } from '@/constants/demand'
import type { HomeAnnouncement } from '@/types'

useAnimSuppress()

/* 首页（社区运营入口导向，2026-09-13 重构）：
 * 搜索框 → 站点标语 → 轮播 → 需求发布 → 双入口(企业合作/人才登记) → 四宫格(文章投稿/积分商城/空间预约/活动计划)
 * → 进行中活动（横滑） → 最新项目 → 精选文章。 */
const router = useRouter()
const config = useConfigStore()
const auth = useAuthStore()
const notices = useNoticesStore()
const { data: feed, loading, error, run } = useAsyncList(fetchHomeFeed)

/* v43：KeepAlive 返回首页时修复 Swiper 高度——组件在隐藏期间会被 SwiperItem 上报的 0 高度覆盖，
 * 激活后持续几帧强制恢复容器高度（之后自动播放的 currentIndex 变更会用 :height 重新校正）。 */
const BANNER_HEIGHT = 130
const bannerRef = ref()
let bannerFixTimers: number[] = []
function fixBannerHeight() {
  const root = bannerRef.value?.$el as HTMLElement | undefined
  const container = root?.querySelector?.('.t-swiper__container') as HTMLElement | null
  if (container) container.style.height = `${BANNER_HEIGHT}px`
}
onActivated(() => {
  bannerFixTimers.forEach((t) => window.clearTimeout(t))
  bannerFixTimers = []
  void nextTick(fixBannerHeight)
  bannerFixTimers.push(window.setTimeout(fixBannerHeight, 150))
  bannerFixTimers.push(window.setTimeout(fixBannerHeight, 450))
})
onBeforeUnmount(() => bannerFixTimers.forEach((t) => window.clearTimeout(t)))

/* v40：为你推荐（按身份/登录态给出 1~2 条，弱规则但可解释） */
const recommendations = computed(() => {
  const f = feed.value
  if (!f) return [] as { key: string; reason: string; title: string; summary: string; path: string }[]
  if (auth.profileIdentities.length) {
    return [...(f.latestDemands ?? [])]
      .sort((a, b) => (b.responseCount ?? 0) - (a.responseCount ?? 0))
      .slice(0, 2)
      .map((d) => ({ key: `demand-${d.id}`, reason: '企业在找合作', title: d.title, summary: `${d.responseCount ?? 0} 人响应 · ${d.categoryLabel}`, path: `/demands/${d.id}` }))
  }
  if (auth.hasCommunityIndividual) {
    return (f.hotEvents ?? []).slice(0, 2).map((e) => ({ key: `event-${e.id}`, reason: '近期热报活动', title: e.title, summary: `${e.startTime} · ${e.enrolled}/${e.capacity} 人已报名`, path: `/events/${e.id}` }))
  }
  const list: { key: string; reason: string; title: string; summary: string; path: string }[] = []
  const firstEvent = (f.hotEvents ?? [])[0]
  const firstArticle = (f.topArticles ?? [])[0]
  if (firstEvent) list.push({ key: `event-${firstEvent.id}`, reason: '近期热门活动', title: firstEvent.title, summary: `${firstEvent.startTime} · ${firstEvent.location}`, path: `/events/${firstEvent.id}` })
  if (firstArticle) list.push({ key: `article-${firstArticle.id}`, reason: '编辑精选', title: firstArticle.title, summary: `${firstArticle.columnLabel} · ${firstArticle.views} 次浏览`, path: `/articles/${firstArticle.id}` })
  return list
})

onMounted(() => {
  config.ensureLoaded()
  run()
  void loadActivation()
})

/* v43：进入不再自动重载聚合与激活任务（下拉刷新已覆盖），仅同步未读角标 */
useRefreshOnActivate(() => {
  if (auth.isLogged) void notices.refreshUnread()
})

/* v37 新手任务清单：目标选择与激活引导（完成即自动隐藏，可手动不再提示） */
const ACTIVATION_KEY = 'joinyuu_activation_dismissed'
interface ActivationStep { key: string; label: string; done: boolean; path: string }
const activationDismissed = ref(localStorage.getItem(ACTIVATION_KEY) === '1')
const activationSteps = ref<ActivationStep[]>([])
const activationDone = computed(() => activationSteps.value.length > 0 && activationSteps.value.every((step) => step.done))

async function loadActivation() {
  if (!auth.isLogged || activationDismissed.value) return
  try {
    const [me, demands, responses, enrollments] = await Promise.all([
      fetchMe(),
      fetchMyDemands(),
      fetchMyResponses(),
      fetchMyEnrollments(),
    ])
    activationSteps.value = [
      { key: 'identity', label: '绑定社区身份', done: auth.identities.some((item) => item.type !== 'individual'), path: '/intros/talent' },
      { key: 'realname', label: '完成实名认证', done: !!me.realNameVerified, path: '/me/realname' },
      { key: 'publish', label: '发布一条需求', done: demands.length > 0, path: '/demands/new' },
      { key: 'respond', label: '响应一次需求', done: responses.length > 0, path: '/projects' },
      { key: 'enroll', label: '报名一场活动', done: enrollments.length > 0, path: '/events' },
    ]
  } catch {
    activationSteps.value = []
  }
}

/* v39：下拉刷新 */
const refreshing = ref(false)

async function onRefresh() {
  refreshing.value = true
  try {
    await run()
    await loadActivation()
    if (auth.isLogged) await notices.refreshUnread()
  } finally {
    setTimeout(() => {
      refreshing.value = false
    }, 300)
  }
}

function dismissActivation() {
  activationDismissed.value = true
  localStorage.setItem(ACTIVATION_KEY, '1')
}

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

/* v38：遵守系统「减少动态效果」设置，关闭轮播自动播放 */
const reduceMotion =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* v40：运营公告（置顶优先展示首条，点击查看全文） */
const announcement = ref<HomeAnnouncement | null>(null)
const announcementVisible = ref(false)

function onAnnouncement(item: HomeAnnouncement) {
  announcement.value = item
  announcementVisible.value = true
}

function onBannerClick(index: number) {
  const b = feed.value?.banners?.[index]
  if (b?.id && bannerLinks[b.id]) {
    void router.push(bannerLinks[b.id])
    return
  }
  /* v38：新增 banner 未配置跳转时给出反馈，避免点了没反应 */
  if (b) Toast('活动预告，敬请期待')
}

function goPublish() {
  void router.push('/demands/new')
}

const featureEntries = computed(() => {
  const list: { path: string; icon: string; label: string; desc: string }[] = [
    { path: '/intros/enterprise', icon: 'usergroup', label: '企业合作', desc: '入驻或成为伙伴' },
    { path: '/intros/talent', icon: 'app', label: '人才登记', desc: '让企业找到你' },
  ]
  /* v39：已有社区企业身份时，第二个入口替换为「企业名片」（个性化） */
  const enterprise = auth.identities.find((item) => item.type === 'community_enterprise' && item.enterpriseId)
  if (enterprise) {
    list[1] = { path: `/me/enterprises/${enterprise.enterpriseId}`, icon: 'app', label: '企业名片', desc: '管理企业与成员' }
  }
  return list
})

const quickEntries = [
  { path: '/articles/new', icon: 'edit-1', label: '文章投稿' },
  { path: '/mall', icon: 'shop', label: '积分商城' },
  { path: '/spaces', icon: 'building', label: '空间预约' },
  { path: '/events', icon: 'calendar', label: '活动计划' },
] as const
</script>

<template>
  <PullDownRefresh :value="refreshing" @refresh="onRefresh">
  <div class="home page-fade-in">
    <!-- 顶部搜索：进入全局搜索页，覆盖项目、活动、文章与社区内容 -->
    <Search v-model="searchKeyword" placeholder="搜索项目、活动、文章或社区服务" @focus="onSearch" @search="onSearch" />

    <!-- v40 运营公告：置顶优先，滚动展示，点击查看全文 -->
    <NoticeBar
      v-if="feed?.announcements?.length"
      visible
      theme="info"
      class="announce-bar"
      :content="feed.announcements[0].title"
      @click="onAnnouncement(feed.announcements[0])"
    />

    <ListSkeleton v-if="loading && !feed" :rows="4" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />

    <template v-else>
      <!-- 轮播 -->
      <Swiper v-if="feed?.banners?.length" ref="bannerRef" class="banner" :height="BANNER_HEIGHT" :loop="true" :autoplay="!reduceMotion" :interval="4500" @click="onBannerClick">
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
        {{ auth.isLogged ? '发布需求 · 让社区一起帮你完成 ›' : '登录后发布需求 ›' }}
      </Button>

      <!-- v37 新手任务清单 -->
      <section v-if="activationSteps.length && !activationDone && !activationDismissed" class="m-card activation">
        <div class="activation-head">
          <h2>新手任务</h2>
          <a @click="dismissActivation">不再提示</a>
        </div>
        <p class="activation-desc">完成以下任务，解锁社区完整能力</p>
        <ul class="activation-list">
          <li
            v-for="step in activationSteps"
            :key="step.key"
            :class="{ done: step.done }"
            @click="!step.done && router.push(step.path)"
          >
            <span class="mark">{{ step.done ? '✅' : '○' }}</span>{{ step.label }}
          </li>
        </ul>
      </section>

      <!-- 两个重要快捷入口 -->
      <Grid :column="2" :gutter="10" hover class="feature-grid stagger">
        <GridItem
          v-for="f in featureEntries"
          :key="f.path"
          class="feature-item"
          v-pressable
          @click="router.push(f.path)"
        >
          <template #image><Icon :name="f.icon" size="22px" /></template>
          <template #text><span class="feature-label">{{ f.label }}</span></template>
          <template #description><span class="feature-desc">{{ f.desc }}</span></template>
        </GridItem>
      </Grid>

      <!-- 四个普通快捷入口 -->
      <Grid :column="4" :gutter="8" hover class="quick-grid stagger">
        <GridItem v-for="q in quickEntries" :key="q.path" class="quick-item" v-pressable @click="router.push(q.path)">
          <template #image><span class="quick-icon"><Icon :name="q.icon" size="22px" /></span></template>
          <template #text>{{ q.label }}</template>
        </GridItem>
      </Grid>

      <!-- 进行中活动（横滑卡片） -->
      <section class="block">
        <div class="block-head">
          <h2>进行中活动</h2>
          <a class="more" v-pressable @click="router.push('/events')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.hotEvents ?? []).length" text="暂无进行中活动" />
        <div v-else class="hot-scroll">
          <article
            v-for="e in feed.hotEvents"
            :key="e.id"
            class="m-card hot-card pressable" v-pressable
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

      <!-- v40 为你推荐 -->
      <section v-if="recommendations.length" class="block">
        <div class="block-head">
          <h2>为你推荐</h2>
        </div>
        <div class="list">
          <article
            v-for="r in recommendations"
            :key="r.key"
            class="m-card demand-item pressable" v-pressable
            @click="router.push(r.path)"
          >
            <div class="d-head">
              <h3 class="d-title">{{ r.title }}</h3>
              <span class="d-cat">{{ r.reason }}</span>
            </div>
            <div class="d-meta">
              <span>{{ r.summary }}</span>
            </div>
          </article>
        </div>
      </section>

      <!-- 最新项目 -->
      <section class="block">
        <div class="block-head">
          <h2>最新项目</h2>
          <a class="more" v-pressable @click="router.push('/projects')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.latestDemands ?? []).length" text="暂无进行中的项目" />
        <div v-else class="list">
          <article v-for="d in feed.latestDemands" :key="d.id" class="m-card demand-item pressable" v-pressable @click="router.push(`/demands/${d.id}`)">
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
          <a class="more" v-pressable @click="router.push('/plaza?tab=articles')">更多 ›</a>
        </div>
        <EmptyBlock v-if="!(feed?.topArticles ?? []).length" text="暂无精选文章" />
        <div v-else class="list">
          <article v-for="a in feed.topArticles" :key="a.id" class="m-card article-item pressable" v-pressable @click="router.push(`/articles/${a.id}`)">
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

    <!-- v40 公告详情（Popup 需保持在根节点内，多根会导致路由 Transition 无法挂载新页面） -->
    <Popup v-model:visible="announcementVisible" placement="bottom">
      <div v-if="announcement" class="announce-sheet">
        <h3 class="announce-title">{{ announcement.title }}</h3>
        <p class="announce-at">{{ announcement.at }}</p>
        <p class="announce-content">{{ announcement.content }}</p>
        <Button variant="outline" block @click="announcementVisible = false">关闭</Button>
      </div>
    </Popup>
  </PullDownRefresh>
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

.announce-bar {
  margin: 0;
  border-radius: var(--td-radius-default);
  cursor: pointer;
}

.announce-sheet {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.announce-title {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
}

.announce-at {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.announce-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
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
  border-radius: var(--td-tag-square-border-radius, 4px);
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

/* v37 新手任务清单 */
.activation-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.activation-head h2 {
  margin: 0;
  font-size: 15px;
}

.activation-head a {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

.activation-desc {
  margin: 6px 0 10px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.activation-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.activation-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--td-text-color-primary);
  cursor: pointer;
}

.activation-list li.done {
  color: var(--td-text-color-placeholder);
  cursor: default;
}

.activation-list .mark {
  flex-shrink: 0;
}
</style>
