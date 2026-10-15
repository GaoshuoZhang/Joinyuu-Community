<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Badge, Button, Icon, Navbar, NoticeBar, TabBar, TabBarItem } from 'tdesign-mobile-vue'
import { NotificationIcon } from 'tdesign-icons-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useCustomerThemeStore } from '@/stores/customerTheme'
import { useNoticesStore } from '@/stores/notices'
import { pageTitleFor } from '@/constants/pageTitles'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动应用壳：Navbar（居中：Tab 页=社区名 / 二级页=页面标题；左：仅二级页返回箭头；
 * 右：头像+昵称（头像在右，/me 页隐藏）→ 铃铛（仅 /me 页显示））
 * + 内容出口 + 底部 5 Tab（首页/需求/社区/广场/我的）。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const customerTheme = useCustomerThemeStore()
const notices = useNoticesStore()

onMounted(() => {
  /* 配置拉取失败不阻塞壳渲染：沿用默认功能开关 */
  void config.ensureLoaded().catch(() => {})
  if (auth.isLogged) notices.refreshUnread()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})

/* v43：顶栏背景随滚动渐显（0 → 1），避免内容滚动到下方时透出文字 */
const NAVBAR_FADE_DISTANCE = 80
const scrollTop = ref(0)
const navbarAlpha = computed(() => Math.min(1, Math.max(0, scrollTop.value / NAVBAR_FADE_DISTANCE)))
const navbarStyle = computed(() => ({
  '--td-navbar-bg-color': `rgba(var(--app-navbar-bg-rgb), ${navbarAlpha.value.toFixed(3)})`,
}))
let scrollRaf = 0
function onWindowScroll() {
  if (scrollRaf) return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = 0
    scrollTop.value = window.scrollY
  })
}
onMounted(() => window.addEventListener('scroll', onWindowScroll, { passive: true }))
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowScroll)
  if (scrollRaf) window.cancelAnimationFrame(scrollRaf)
})
/* 路由切换/返回恢复滚动位置后同步一次（避免残留上次的透明度） */
watch(
  () => route.fullPath,
  () => {
    window.requestAnimationFrame(() => {
      scrollTop.value = window.scrollY
    })
  },
)

/* v38：离线提示（弱网/断网时给用户明确反馈） */
const offline = ref(typeof navigator !== 'undefined' && !navigator.onLine)
function onOnline() {
  offline.value = false
}
function onOffline() {
  offline.value = true
}

const tabs = [
  { value: '/', label: '首页', icon: 'home' },
  { value: '/projects', label: '需求', icon: 'app' },
  { value: '/community', label: '社区', icon: 'usergroup' },
  { value: '/plaza', label: '广场', icon: 'compass' },
  { value: '/me', label: '我的', icon: 'user' },
] as const

/* 底部 Tab 高亮（v36：按路由段集中映射，二级页稳定归属所属 Tab，不依赖路径前缀猜断） */
const TAB_BY_SEGMENT: Record<string, string> = {
  '': '/',
  search: '/',
  projects: '/projects',
  demands: '/projects',
  community: '/community',
  talents: '/community',
  enterprises: '/community',
  spaces: '/community',
  intros: '/community',
  plaza: '/plaza',
  events: '/plaza',
  articles: '/plaza',
  mall: '/me',
  me: '/me',
  notices: '/me',
  applications: '/me',
}
const TAB_ROOTS = new Set<string>(tabs.map((tab) => tab.value))
const active = computed(() => {
  const segment = route.path.split('/')[1] ?? ''
  const target = TAB_BY_SEGMENT[segment] ?? `/${segment}`
  return TAB_ROOTS.has(target) ? target : ''
})

/* 二级页标题映射（按前缀最长优先匹配）；param 路由用前缀，如 /demands/:id、/events/:id/check-in、/talents/:uid */
/* 仅底部 Tab 对应路径按 Tab 页处理（居中显示社区名 + 无返回箭头）；/me/** 等二级页显示返回箭头与标题 */
const isTab = computed(() => tabs.some((t) => t.value === route.path))

/* v38：需要保留浏览状态的列表页（组件名 = 文件名） */
const KEEP_ALIVE_NAMES = [
  'HomeView',
  'MeView',
  'GlobalSearchView',
  'ProjectsView',
  'CommunityView',
  'PlazaView',
  'MallView',
  'SpacesView',
]
/* 「我的」页：隐藏右上角用户信息、仅显示消息铃铛 */
const isMe = computed(() => route.path === '/me')
const pageTitle = computed(() => {
  if (isTab.value) return ''
  /* P1：实名页标题随核验模式切换（实名认证 / 身份信息登记） */
  if (route.name === 'me-realname') return config.realnameLabel
  return pageTitleFor(route)
})

/* v41/v43：削减动画——Tab 间切换不播放页面过渡；缓存页再次激活的入场动画抑制由
 * useAnimSuppress 在页面根元素上处理（避免 shell 类切换让离场页重放动画）。
 * v50：二级页入场不再用 Transition mode="out-in"——「旧页淡出→空窗→新页淡入」两段动画
 * 期间会露出灰色页面底色（表现为点击进二级页时「先闪一下」），且与页面根元素自带的
 * .page-fade-in 叠加成双重淡入（透明度相乘，前段几乎全透明）。改为旧页即时移除、
 * 入场动效统一交给 .page-fade-in 单段淡入；Tab→Tab 的缓存页由 useAnimSuppress 抑制重放，
 * 保持无动画切换。 */

/* v41：深链进入二级页时，返回按板块回到来源列表而不是一律回首页 */
const BACK_FALLBACK: Record<string, string> = {
  articles: '/plaza?tab=articles',
  events: '/plaza?tab=events',
  demands: '/projects',
  mall: '/mall',
  talents: '/community?tab=talent',
  enterprises: '/community?tab=enterprise',
  spaces: '/spaces',
  search: '/',
  me: '/me',
  notices: '/me',
  applications: '/me',
  intros: '/community',
}

function goBack() {
  /* v38：优先判断路由历史中是否真的有上一页，避免深链/新标签页直接退出应用 */
  const back = (window.history.state as { back?: string | null } | null)?.back
  if (back) {
    router.back()
    return
  }
  const segment = route.path.split('/')[1] ?? ''
  void router.push(BACK_FALLBACK[segment] ?? TAB_BY_SEGMENT[segment] ?? '/')
}

function onTabChange(value: string | number) {
  const path = String(value)
  /* 精确比较：在 /me/** 等二级页点击所属 Tab 时回到 Tab 根路径 */
  if (route.path === path) {
    /* v38：再次点击当前 Tab 回到顶部（移动端通用预期） */
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  void router.push(path)
}

function onNotices() {
  void router.push('/notices')
}
</script>

<template>
  <div class="m-shell" :class="{ 'theme-preview': customerTheme.preview }">
    <Navbar
      fixed
      placeholder
      :left-arrow="false"
      :z-index="100"
      :safe-area-inset-top="true"
      :style="navbarStyle"
    >
      <template #left>
        <Button v-if="!isTab" class="nav-back" variant="text" shape="square" aria-label="返回" @click="goBack"><Icon aria-hidden="true" name="chevron-left" size="24px" /></Button>
      </template>
      <template #title>
        <h1 class="navbar-title">{{ pageTitle || customerTheme.theme?.brand?.name || config.config.siteName || '聚屿社区' }}</h1>
      </template>
      <template #right>
        <Button v-if="auth.isLogged && !isMe" class="nav-me" variant="text" shape="square" size="large" aria-label="我的" @click="router.push('/me')">
          <Avatar size="30px" :image="auth.avatar">{{ auth.name.slice(0, 1) }}</Avatar>
        </Button>
        <Badge v-if="isMe" class="bell-badge" :count="notices.unread" :max-count="99" :offset="[-10, 10]">
          <Button class="nav-bell" variant="text" shape="square" size="large" aria-label="站内信" @click="onNotices">
            <NotificationIcon size="22px" />
          </Button>
        </Badge>
      </template>
    </Navbar>

    <NoticeBar
      v-if="offline"
      visible
      theme="warning"
      content="当前网络不可用，部分内容可能不是最新，请检查网络后重试。"
      class="offline-bar"
    />

    <main id="main" class="m-content" :class="{ 'has-tabbar': isTab }" tabindex="-1">
      <!-- v38：列表/浏览页 KeepAlive，保留筛选、分页与滚动位置；详情页即时重建；
           v50：不再包 Transition——out-in 的淡出空窗会露灰底（「闪一下」），入场动效由页面根元素 .page-fade-in 单段完成 -->
      <router-view v-slot="{ Component, route: current }">
        <KeepAlive :include="KEEP_ALIVE_NAMES">
          <component :is="Component" :key="current.meta.keepAlive ? String(current.name) : current.fullPath" />
        </KeepAlive>
      </router-view>
    </main>

    <TabBar v-if="isTab" :value="active" :fixed="true" :placeholder="false" safe-area-inset-bottom :bordered="true" @change="onTabChange">
      <TabBarItem v-for="tab in tabs" :key="tab.value" :value="tab.value">
        <template #icon>
          <Badge v-if="tab.value === '/me' && notices.unread > 0" :count="notices.unread" :max-count="99">
            <Icon aria-hidden="true" :name="tab.icon" size="22px" />
          </Badge>
          <Icon aria-hidden="true" v-else :name="tab.icon" size="22px" />
        </template>
        {{ tab.label }}
      </TabBarItem>
    </TabBar>
  </div>
</template>

<style scoped>
.nav-back { width: 44px; min-width: 44px; height: 44px; padding: 0; }
.theme-preview :deep(.t-navbar--fixed .t-navbar__content) {
  top: var(--app-theme-preview-height, 0px);
}
/* v43：顶栏背景渐变过渡（透明度由内联 CSS 变量控制） */
.m-shell :deep(.t-navbar__content) {
  transition: background-color 160ms linear;
}

/* 页标题为 h1（Navbar 默认渲染 span，视觉与库内 title 一致） */
.navbar-title { margin:0; font: var(--td-navbar-title-font); /* typography-token-exempt: 需跟随 TDesign Navbar 标题字体变量保持与库内 title 一致，改角色档会改变导航栏标题字号；升级 TDesign 时复核 --td-navbar-title-font */ }

.m-shell {
  --td-tab-bar-height: var(--app-mobile-tabbar-h);

  min-height: 100vh;
  /* v38：dvh 兜底，避免移动端浏览器工具栏遮挡 */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--td-bg-color-page);
}

.m-content {
  flex: 1;
  width: 100%;
  max-width: var(--app-content-mobile-max);
  margin-inline: auto;
  padding-bottom: calc(var(--app-space-8) + env(safe-area-inset-bottom));
}

.m-shell :deep(.t-navbar--fixed .t-navbar__content),
.m-shell :deep(.t-tab-bar) {
  max-width: var(--app-content-mobile-max);
  margin-inline: auto;
}

/* 一级 Tab 才为固定底栏留位；详情/表单页隐藏底栏，保持清晰的任务层级。 */
.m-content.has-tabbar {
  padding-bottom: calc(var(--app-mobile-tabbar-h) + var(--app-space-8) + env(safe-area-inset-bottom));
}

.offline-bar {
  --td-notice-bar-warning-color: var(--td-warning-color);
}

/* v50：页面切换过渡样式已移除——out-in 两段动画的淡出空窗露灰底（「闪一下」根因），
 * 入场动效统一由 tokens.css 的 .page-fade-in 单段淡入承担 */

/* 右上角：头像（点击进「我的」） */
.nav-me {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  margin-right:calc(-1 * var(--app-space-3));
  padding:0;
  border: none;
  background: none;
  border-radius: var(--td-radius-circle);
  cursor: pointer;
}

/* v39 修复：44px 触控目标加在按钮上，铃铛图标保持 22px（此前直接作用于 SVG 被拉伸） */
.nav-bell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding:0;
  border: none;
  background: none;
  color: var(--td-text-color-primary);
  cursor: pointer;
}

/* v43：铃铛角标容器不再使用负外边距，避免红点漂出屏幕 */
.bell-badge {
  display: inline-flex;
}
</style>
