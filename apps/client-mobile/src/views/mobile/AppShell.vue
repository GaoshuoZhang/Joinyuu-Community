<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Badge, Icon, Navbar, TabBar, TabBarItem } from 'tdesign-mobile-vue'
import { ChevronLeftIcon, NotificationIcon } from 'tdesign-icons-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动应用壳：Navbar（居中：Tab 页=社区名 / 二级页=页面标题；左：仅二级页返回箭头；
 * 右：头像+昵称（头像在右，/me 页隐藏）→ 铃铛（仅 /me 页显示））
 * + 内容出口 + 底部 5 Tab（首页/项目/社区/广场/我的）。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()

onMounted(() => {
  config.ensureLoaded()
  if (auth.isLogged) notices.refreshUnread()
})

const tabs = [
  { value: '/', label: '首页', icon: 'home' },
  { value: '/projects', label: '项目', icon: 'app' },
  { value: '/community', label: '社区', icon: 'usergroup' },
  { value: '/plaza', label: '广场', icon: 'calendar' },
  { value: '/me', label: '我的', icon: 'user' },
] as const

/* 底部 Tab 高亮：企业/人才名片归属「社区」Tab（其余按首段路径匹配） */
const TAB_ALIASES: Record<string, string> = {
  enterprises: '/community',
  talents: '/community',
}
const active = computed(() => {
  const segment = route.path.split('/')[1] ?? ''
  return TAB_ALIASES[segment] ?? '/' + segment
})

/* 二级页标题映射（按前缀最长优先匹配）；param 路由用前缀，如 /demands/:id、/events/:id/check-in、/talents/:uid */
const PAGE_TITLES: [string, string][] = [
  ['/me/cards/individual', '个人名片'],
  ['/me/identities', '关联身份'],
  ['/me/invitations', '企业邀请'],
  ['/me/enterprises', '企业详情'],
  ['/me/profile/edit', '编辑资料'],
  ['/me/realname', '实名认证'],
  ['/me/applications', '我的申请'],
  ['/me/reservations', '我的预约'],
  ['/me/enrollments', '我的报名'],
  ['/me/responses', '我的响应'],
  ['/me/experience', '我的等级'],
  ['/me/demands', '我的需求'],
  ['/me/projects', '我的项目'],
  ['/me/articles', '我的投稿'],
  ['/me/orders', '我的订单'],
  ['/me/points', '我的积分'],
  ['/check-in', '签到'],
  ['/events', '活动计划'],
  ['/spaces/reserve', '预约提交'],
  ['/spaces', '空间预约'],
  ['/mall', '积分商城'],
  ['/articles/new', '文章投稿'],
  ['/articles', '社区内容'],
  ['/talents', '个人名片'],
  ['/intros/enterprise', '企业合作'],
  ['/intros/settle', '企业入驻'],
  ['/intros/cooperation', '合作伙伴'],
  ['/intros/talent', '人才登记'],
  ['/demands/new/task', '找服务'],
  ['/demands/new/invest', '找投资'],
  ['/demands/new/cooperation', '找合作'],
  ['/demands/new', '发布需求'],
  ['/demands', '项目详情'],
  ['/showcase-apply', '企业名片申请'],
  ['/enterprises', '企业名片'],
  ['/applications/settle', '企业入驻申请'],
  ['/applications/cooperation', '合作伙伴申请'],
  ['/applications/individual', '人才登记申请'],
  ['/applications/new', '身份绑定申请'],
  ['/notices', '站内信'],
]

/* 仅底部 Tab 对应路径按 Tab 页处理（居中显示社区名 + 无返回箭头）；/me/** 等二级页显示返回箭头与标题 */
const isTab = computed(() => tabs.some((t) => t.value === route.path))
/* 「我的」页：隐藏右上角用户信息、仅显示消息铃铛 */
const isMe = computed(() => route.path === '/me')
const pageTitle = computed(() => {
  if (isTab.value) return ''
  const p = route.path
  /* 编辑企业名片 / 成员管理：需先于 /me/enterprises 前缀命中 */
  if (/^\/me\/enterprises\/[^/]+\/edit$/.test(p)) return '编辑企业名片'
  if (/^\/me\/enterprises\/[^/]+\/members\//.test(p)) return '成员管理'
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
  /* 精确比较：在 /me/** 等二级页点击所属 Tab 时回到 Tab 根路径 */
  if (route.path !== path) void router.push(path)
}

function onNotices() {
  void router.push('/notices')
}
</script>

<template>
  <div class="m-shell">
    <Navbar :title="pageTitle || config.config.siteName || '聚屿社区'" :fixed="false" :safe-area-inset-top="false">
      <template #left>
        <ChevronLeftIcon v-if="!isTab" class="nav-back" size="24px" aria-label="返回" @click="goBack" />
      </template>
      <template #right>
        <button v-if="auth.isLogged && !isMe" class="nav-me" type="button" aria-label="我的" @click="router.push('/me')">
          <Avatar size="30px" :image="auth.avatar">{{ auth.name.slice(0, 1) }}</Avatar>
        </button>
        <Badge v-if="isMe" :count="notices.unread" :max-count="99">
          <NotificationIcon class="bell" size="22px" aria-label="站内信" @click="onNotices" />
        </Badge>
      </template>
    </Navbar>

    <main class="m-content">
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" :key="$route.fullPath" />
        </Transition>
      </router-view>
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

/* 右上角：头像（点击进「我的」） */
.nav-me {
  display: inline-flex;
  align-items: center;
  padding: 2px 4px;
  border: none;
  background: none;
  border-radius: var(--td-radius-circle);
  cursor: pointer;
}

.bell {
  display: block;
  color: var(--td-text-color-primary);
  cursor: pointer;
}
</style>
