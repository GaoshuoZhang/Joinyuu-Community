<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Badge, Icon, Navbar, TabBar, TabBarItem } from 'tdesign-mobile-vue'
import { ChevronLeftIcon, NotificationIcon } from 'tdesign-icons-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动应用壳：Navbar（左：Tab 页=社区名 / 二级页=返回箭头；右：头像+当前身份 → 铃铛）
 * + 内容出口 + 底部 5 Tab（首页/项目/社区/广场/我的）。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const tabs = [
  { value: '/', label: '首页', icon: 'home' },
  { value: '/projects', label: '项目', icon: 'app' },
  { value: '/community', label: '社区', icon: 'usergroup' },
  { value: '/plaza', label: '广场', icon: 'calendar' },
  { value: '/me', label: '我的', icon: 'user' },
] as const

const active = computed(() => '/' + (route.path.split('/')[1] ?? ''))

/* 二级页标题映射（按前缀最长优先匹配）；param 路由用前缀，如 /demands/:id、/events/:id/check-in */
const PAGE_TITLES: [string, string][] = [
  ['/me/profile/edit', '编辑资料'],
  ['/me/applications', '我的申请'],
  ['/me/reservations', '我的预约'],
  ['/me/enrollments', '我的报名'],
  ['/me/responses', '我的响应'],
  ['/me/experience', '我的经验'],
  ['/me/demands', '我的需求'],
  ['/me/projects', '我的项目'],
  ['/me/articles', '我的投稿'],
  ['/me/orders', '我的订单'],
  ['/me/points', '我的积分'],
  ['/events/check-in', '位置签到'],
  ['/events', '活动计划'],
  ['/spaces/reserve', '预约提交'],
  ['/spaces', '空间预约'],
  ['/mall', '积分商城'],
  ['/articles/new', '文章投稿'],
  ['/articles', '社区内容'],
  ['/intros/enterprise', '企业入驻'],
  ['/intros/talent', '人才登记'],
  ['/demands/new', '发布需求'],
  ['/demands', '项目详情'],
  ['/showcase-apply', '展示页申请'],
  ['/enterprises', '企业展示'],
  ['/applications/new', '提交申请'],
  ['/notices', '站内信'],
]

const isTab = computed(() => tabs.some((t) => t.value === active.value))
const pageTitle = computed(() => {
  if (isTab.value) return ''
  const p = route.path
  for (const [prefix, title] of PAGE_TITLES) {
    if (p.includes(prefix)) return title
  }
  return ''
})

function goBack() {
  if (window.history.length > 1) router.back()
  else void router.push('/')
}

function onTabChange(value: string | number) {
  const path = String(value)
  if (path !== active.value) void router.push(path)
}

function onNotices() {
  void router.push('/notices')
}
</script>

<template>
  <div class="m-shell">
    <Navbar :title="pageTitle" :fixed="false" :safe-area-inset-top="false">
      <template #left>
        <ChevronLeftIcon v-if="!isTab" class="nav-back" size="24px" aria-label="返回" @click="goBack" />
        <span v-else class="nav-brand">
          <Avatar shape="round" size="24px" class="nav-logo">聚</Avatar>
          <span class="nav-name">聚屿社区</span>
        </span>
      </template>
      <template #right>
        <button v-if="auth.isLogged" class="nav-me" type="button" aria-label="我的" @click="router.push('/me')">
          <Avatar size="30px">{{ auth.name.slice(0, 1) }}</Avatar>
          <span class="nav-text">
            <span class="nav-title">{{ auth.activeIdentityName }}</span>
            <span class="nav-sub">{{ auth.activeIdentityLabel }}</span>
          </span>
        </button>
        <Badge :count="notices.unread" :max-count="99">
          <NotificationIcon class="bell" size="22px" aria-label="站内信" @click="onNotices" />
        </Badge>
      </template>
    </Navbar>

    <main class="m-content">
      <Transition name="page" mode="out-in">
        <router-view :key="$route.fullPath" />
      </Transition>
    </main>

    <TabBar :value="active" :fixed="true" :placeholder="false" safe-area-inset-bottom :bordered="true" @change="onTabChange">
      <TabBarItem v-for="tab in tabs" :key="tab.value" :value="tab.value">
        <template #icon><Icon :name="tab.icon" size="22px" /></template>
        {{ tab.label }}
      </TabBarItem>
    </TabBar>
  </div>
</template>

<style scoped>
.m-shell {
  --td-tab-bar-height: var(--app-mobile-tabbar-h);

  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--td-bg-color-page);
}

.m-content {
  flex: 1;
  padding-bottom: calc(var(--app-mobile-tabbar-h) + 16px);
}

/* 页面切换过渡：上移淡入（与 tokens 的 page-fade-in 同节奏） */
.page-enter-active,
.page-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.nav-back {
  display: block;
  color: var(--td-text-color-primary);
  cursor: pointer;
}

.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.nav-logo {
  font-size: 13px;
  font-weight: 700;
}

.nav-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--td-text-color-primary);
}

/* 右上角：头像 + 两行文字（大字=昵称/企业名，小字=身份） */
.nav-me {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 2px 4px;
  border: none;
  background: none;
  border-radius: var(--td-radius-circle);
  cursor: pointer;
}

.nav-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.nav-title {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  line-height: 17px;
  color: var(--td-text-color-primary);
}

.nav-sub {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 15px;
  color: var(--td-text-color-secondary);
}

.bell {
  display: block;
  color: var(--td-text-color-primary);
  cursor: pointer;
}
</style>
