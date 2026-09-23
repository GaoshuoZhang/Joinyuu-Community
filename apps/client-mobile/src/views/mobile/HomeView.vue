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
import { useAtTop } from '@/composables/useAtTop'
import { fetchHomeFeed } from '@/api/home'
import { fetchMyDemands, fetchMyResponses } from '@/api/demands'
import { fetchMyEnrollments } from '@/api/events'
import { fetchMe, dismissActivation as dismissActivationApi } from '@/api/me'
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

/* v46：刷新失败不再把已加载的整页内容替换为错误块——无数据时才整页提示，
 * 已有内容时保留内容并提示刷新失败，避免用户失去已读到的信息。 */
watch(error, (message) => {
  if (message && feed.value) Toast('刷新失败，请稍后重试')
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
    /* 服务端已记录永久隐藏（换浏览器/设备也一致）：同步本地缓存并跳过引导 */
    if (me.activationDismissed) {
      activationDismissed.value = true
      localStorage.setItem(`${ACTIVATION_KEY_PREFIX}${uid}`, '1')
      return
    }
    activationSteps.value = [
      { key: 'identity', label: '绑定社区身份', done: me.identities.some((item) => item.type !== 'individual'), path: '/intros/talent' },
      { key: 'realname', label: '完成实名认证', done: !!me.realNameVerified, path: '/me/realname' },
      { key: 'publish', label: '发布一条需求', done: demands.length > 0, path: '/demands/new' },
      { key: 'respond', label: '响应一次需求', done: responses.length > 0, path: '/projects' },
      { key: 'enroll', label: '报名一场活动', done: enrollments.list.length > 0, path: '/plaza?tab=events' },
    ]
  } catch {
    /* 加载失败保留上次步骤（下拉刷新会重试），避免任务卡「凭空蒸发」；
     * 跨账号切换时 watch(auth.uid) 已先行清空，不存在旧数据残留 */
  }
}

/* v39：下拉刷新 */
const refreshing = ref(false)
/* 离顶时禁用下拉刷新：库内 isReachTop 会被行内 overflow 元素误判为已到顶，导致上滑被拦回弹 */
const atTop = useAtTop()
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
  const uid = auth.uid
  activationDismissed.value = true
  localStorage.setItem(`${ACTIVATION_KEY_PREFIX}${uid}`, '1')
  /* 服务端持久化失败不影响本地隐藏（同浏览器仍生效），下次进入会重试同步 */
  void dismissActivationApi().catch(() => undefined)
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

/* v40：运营公告——后台多条维护、最多启用一条（互锁），故首页最多展示 1 条；点击查看全文 */
const announcementItems = computed(() => feed.value?.announcements ?? [])
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

/* v48：核心功能入口——企业合作 / 企业名片（人才登记）为「宽 2 单位 × 高 1 单位」两列卡，
 * 文章投稿 / 积分商城 / 空间预约 / 活动计划为「宽 1 单位 × 高 1 单位」四列方形卡；
 * 两组前置到搜索栏下方（用户视为核心功能），商城/空间预约入口按功能开关收敛（D-008）。
 * v49：按已关联身份个性化——有企业身份（社区企业/合作企业，不含社区个体）→「企业管理」；
 * 第二个入口固定为「个人名片」（有社区个体）或「人才登记」（无），不再显示企业名片卡片。 */
const featureEntries = computed(() => {
  const hasEnterpriseIdentity = auth.identities.some(
    (item) => item.type === 'community_enterprise' || item.type === 'external_enterprise',
  )
  const list: { path: string; icon: string; label: string; desc: string }[] = [
    hasEnterpriseIdentity
      ? { path: '/me/identities?filter=enterprise', icon: 'usergroup', label: '企业管理', desc: '管理关联企业身份' }
      : { path: '/intros/enterprise', icon: 'usergroup', label: '企业合作', desc: '入驻或成为伙伴' },
  ]
  if (auth.hasCommunityIndividual) {
    list.push({ path: '/me/cards/individual', icon: 'app', label: '个人名片', desc: '完善个人展示' })
  } else {
    list.push({ path: '/intros/talent', icon: 'app', label: '人才登记', desc: '让企业找到你' })
  }
  return list
})

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
  <PullDownRefresh :value="refreshing" :disabled="!atTop" @refresh="onRefresh">
    <div class="home page-fade-in">
      <!-- 顶部搜索：点击进入全局搜索页（focus 不跳转，保证键盘可达）。
           v46：这里是跳转入口而非输入框，readonly 避免先弹软键盘再跳页。
           键盘 Enter 走 submit 事件（TDesign Search 回车发 onSubmit，@search 是输入联想事件、readonly 下永不触发）。 -->
      <Search v-model="searchKeyword" readonly placeholder="搜索需求、活动、文章或社区服务…" @click="onSearch" @submit="onSearch" />

      <!-- v48：核心功能入口前置到搜索栏下方（2 单位宽卡 ×2 + 1 单位方形卡 ×4） -->
      <HomeEntryGrids
        :features="featureEntries"
        :quick="quickEntries"
        @open="(path: string) => router.push(path)"
      />

      <!-- v48：发布入口紧跟在四个方形入口之下（发布是最常用的核心动作），并保持描边次级形态 -->
      <Button v-if="config.config.demandOpen" theme="primary" variant="outline" block size="large" class="publish-entry pressable" @click="goPublish">
        <template #icon><Icon aria-hidden="true" name="flag" size="20px" /></template>
        {{ auth.isLogged ? '发布需求 · 让社区一起帮你完成' : '登录后发布需求' }}
        <template #suffix><Icon aria-hidden="true" name="chevron-right" size="16px" /></template>
      </Button>

      <!-- v49：新手任务紧随发布入口（默认折叠，展开后再看任务），不再收在页面底部 -->
      <ActivationChecklist
        v-if="showActivation"
        :steps="visibleActivationSteps"
        @dismiss="dismissActivation"
      />

      <!-- 运营公告：后台启用互锁保证至多一条，首页仅展示该条。
           v-pressable 补 role=button/tabindex/键盘激活；suffixIcon 提供「可点开」的视觉暗示。 -->
      <NoticeBar
        v-if="announcementItems.length"
        v-pressable
        visible
        theme="info"
        class="announce-bar"
        :content="announcementItems[0].title"
        @click="onAnnouncement(announcementItems[0])"
      >
        <template #suffixIcon><Icon aria-hidden="true" name="chevron-right" size="16px" /></template>
      </NoticeBar>

      <ListSkeleton v-if="loading && !feed" :rows="4" />
      <EmptyBlock v-else-if="error && !feed" :text="error" action-text="重试" @action="run" />

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

        <HomeFeedSection
          title="最新资讯"
          :items="articleItems"
          empty-text="暂无最新资讯"
          more-path="/plaza?tab=articles"
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

/* v46：公告标题可能很长——官方结构为「inline-block + nowrap」的硬裁切，
 * 补 max-width 与省略号（保持单行信息层级与 48px 触控高度）。 */
.announce-bar :deep(.t-notice-bar__content) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

</style>
