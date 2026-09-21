<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, NoticeBar, PullDownRefresh, Search, Toast } from 'tdesign-mobile-vue'
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
import HomeBanner from '@/components/home/HomeBanner.vue'
import ActivationChecklist from '@/components/home/ActivationChecklist.vue'
import HomeEntryGrids from '@/components/home/HomeEntryGrids.vue'
import HotEventStrip from '@/components/home/HotEventStrip.vue'
import HomeFeedSection from '@/components/home/HomeFeedSection.vue'
import HomeAnnouncementSheet from '@/components/home/HomeAnnouncementSheet.vue'
import type { FeedItem } from '@/components/home/HomeFeedSection.vue'
import { demandDateText } from '@/constants/demand'
import type { HomeAnnouncement } from '@/types'
import { formatLocalDate, formatZhNumber } from '@/utils/format'

useAnimSuppress()

/* 首页（社区运营入口导向）：搜索 → 公告 → 轮播 → 发布 → 入口宫格 → 近期活动 → 最新需求/资讯。 */
const router = useRouter()
const config = useConfigStore()
const auth = useAuthStore()
const notices = useNoticesStore()
const { data: feed, loading, error, run } = useAsyncList(fetchHomeFeed)

/* 最新需求 / 最新资讯卡片数据
 * v45 首页信息层级：内容区每块只展示前 2 条，其余交给「更多」——避免首屏被长列表挤满。 */
const HOME_FEED_LIMIT = 2
const demandItems = computed<FeedItem[]>(() =>
  (feed.value?.latestDemands ?? [])
    .map((d) => ({
      key: d.id,
      title: d.title,
      tag: d.categoryLabel,
      path: `/demands/${d.id}`,
      metas: [
        { text: d.publisherName },
        ...(demandDateText(d) ? [{ text: demandDateText(d) as string }] : []),
        { text: `${formatZhNumber(d.responseCount)} 人响应`, accent: true },
      ],
    }))
    .slice(0, HOME_FEED_LIMIT),
)
const articleItems = computed<FeedItem[]>(() =>
  (feed.value?.topArticles ?? [])
    .map((a) => ({
      key: a.id,
      title: a.title,
      tag: a.columnLabel,
      path: `/articles/${a.id}`,
      /* v45 首页信息流的时间只到日粒度：时分对「最新资讯」的浏览决策没有帮助 */
      metas: [{ text: formatLocalDate(a.publishedAt) }, { text: `${formatZhNumber(a.views)} 次浏览` }],
    }))
    .slice(0, HOME_FEED_LIMIT),
)

onMounted(() => {
  /* 配置拉取失败不阻塞页面：沿用默认功能开关 */
  void config.ensureLoaded().catch(() => {})
  run()
})

/* KeepAlive 返回首页时刷新新手任务完成状态，并同步未读角标。 */
useRefreshOnActivate(() => {
  void loadActivation()
  if (auth.isLogged) void notices.refreshUnread()
})

/* v37 新手任务清单：目标选择与激活引导（完成即自动隐藏，可手动不再提示） */
const ACTIVATION_KEY_PREFIX = 'joinyuu_activation_dismissed:'
interface ActivationStep { key: string; label: string; done: boolean; path: string }
const activationDismissed = ref(false)
const activationSteps = ref<ActivationStep[]>([])
/* v41：新手任务清单完成态判断基于可见步骤 */
const visibleActivationSteps = computed(() =>
  config.config.demandOpen
    ? activationSteps.value
    : activationSteps.value.filter((step) => step.key !== 'publish' && step.key !== 'respond'),
)
const activationDone = computed(
  () => visibleActivationSteps.value.length > 0 && visibleActivationSteps.value.every((step) => step.done),
)
const showActivation = computed(
  () => visibleActivationSteps.value.length > 0 && !activationDone.value && !activationDismissed.value,
)

watch(
  () => auth.uid,
  (uid) => {
    activationDismissed.value = uid
      ? localStorage.getItem(`${ACTIVATION_KEY_PREFIX}${uid}`) === '1'
      : false
    activationSteps.value = []
    if (uid && !activationDismissed.value) void loadActivation()
  },
  { immediate: true },
)

async function loadActivation() {
  if (!auth.isLogged || !auth.uid || activationDismissed.value) return
  const uid = auth.uid
  try {
    const [me, demands, responses, enrollments] = await Promise.all([
      fetchMe(),
      fetchMyDemands(),
      fetchMyResponses(),
      fetchMyEnrollments(),
    ])
    if (auth.uid !== uid || activationDismissed.value) return
    activationSteps.value = [
      { key: 'identity', label: '绑定社区身份', done: me.identities.some((item) => item.type !== 'individual'), path: '/intros/talent' },
      { key: 'realname', label: '完成实名认证', done: !!me.realNameVerified, path: '/me/realname' },
      { key: 'publish', label: '发布一条需求', done: demands.length > 0, path: '/demands/new' },
      { key: 'respond', label: '响应一次需求', done: responses.length > 0, path: '/projects' },
      { key: 'enroll', label: '报名一场活动', done: enrollments.list.length > 0, path: '/plaza?tab=events' },
    ]
  } catch {
    if (auth.uid === uid) activationSteps.value = []
  }
}

/* v39：下拉刷新 */
const refreshing = ref(false)
let refreshTimer: ReturnType<typeof setTimeout> | null = null

async function onRefresh() {
  refreshing.value = true
  try {
    await run()
    await loadActivation()
    if (auth.isLogged) await notices.refreshUnread()
  } finally {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshing.value = false
      refreshTimer = null
    }, 300)
  }
}

onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
})

function dismissActivation() {
  if (!auth.uid) return
  activationDismissed.value = true
  localStorage.setItem(`${ACTIVATION_KEY_PREFIX}${auth.uid}`, '1')
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
  if (b?.link) {
    void router.push(b.link)
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

/* 快捷入口按功能开关收敛（D-008）：商城/空间预约关闭时同步隐藏入口 */
const quickEntries = computed(() => {
  const list: { path: string; icon: string; label: string }[] = [
    { path: '/articles/new', icon: 'edit-1', label: '文章投稿' },
  ]
  if (config.config.mallOpen) list.push({ path: '/mall', icon: 'shop', label: '积分商城' })
  if (config.config.reservationOpen) list.push({ path: '/spaces', icon: 'building', label: '空间预约' })
  list.push({ path: '/plaza?tab=events', icon: 'calendar', label: '活动计划' })
  return list
})
</script>

<template>
  <PullDownRefresh :value="refreshing" @refresh="onRefresh">
    <div class="home page-fade-in">
      <!-- 顶部搜索：点击进入全局搜索页（focus 不跳转，保证键盘可达） -->
      <Search v-model="searchKeyword" placeholder="搜索项目、活动、文章或社区服务…" @click="onSearch" @search="onSearch" />

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
        <!-- 唯一运营位：轮播 -->
        <HomeBanner
          v-if="feed?.carouselEnabled !== false && feed?.banners?.length"
          :banners="feed.banners"
          :reduce-motion="reduceMotion"
          @select="onBannerClick"
        />

        <!-- v45 内容优先：先让用户看到社区里有什么，再出现引导与入口 -->
        <HotEventStrip :events="feed?.hotEvents ?? []" />

        <HomeFeedSection
          title="最新需求"
          :items="demandItems"
          empty-text="暂无最新需求"
          more-path="/projects"
        />

        <!-- 发布入口放在需求语境之后（先浏览、再发布），并降为描边次级按钮，不与轮播争焦点 -->
        <Button v-if="config.config.demandOpen" theme="primary" variant="outline" block size="large" class="publish-entry pressable" @click="goPublish">
          <template #icon><Icon aria-hidden="true" name="flag" size="20px" /></template>
          {{ auth.isLogged ? '发布需求 · 让社区一起帮你完成' : '登录后发布需求' }}
          <template #suffix><Icon aria-hidden="true" name="chevron-right" size="16px" /></template>
        </Button>

        <HomeFeedSection
          title="最新资讯"
          :items="articleItems"
          empty-text="暂无最新资讯"
          more-path="/plaza?tab=articles"
        />

        <HomeEntryGrids
          :features="featureEntries"
          :quick="quickEntries"
          @open="(path: string) => router.push(path)"
        />

        <!-- 新手任务收在内容之后：先看到内容，再决定是否开始引导 -->
        <ActivationChecklist
          v-if="showActivation"
          :steps="visibleActivationSteps"
          @dismiss="dismissActivation"
        />
      </template>
    </div>

    <HomeAnnouncementSheet v-model:visible="announcementVisible" :announcement="announcement" />
  </PullDownRefresh>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-8);
}


.announce-bar {
  margin:0;
  border-radius: var(--td-radius-large);
  cursor: pointer;
}
</style>
