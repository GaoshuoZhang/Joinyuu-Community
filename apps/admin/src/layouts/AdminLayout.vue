<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppIcon,
  Building1Icon,
  BuildingIcon,
  CalendarIcon,
  CartIcon,
  ChatIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CloseIcon,
  DashboardIcon,
  Edit2Icon,
  InfoCircleIcon,
  LayersIcon,
  MapIcon,
  MoonIcon,
  NotificationIcon,
  SettingIcon,
  SunnyIcon,
  UserCircleIcon,
  UserIcon,
  UserListIcon,
  ViewListIcon,
  ViewModuleIcon,
} from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import { useAuthStore } from '@/stores/auth'
import { useTabsStore } from '@/stores/tabs'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'
import { scopeAllowsGroup } from '@/constants/scopes'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications'
import type { AdminNotification } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const tabs = useTabsStore()
const theme = useThemeStore()
const branding = useBrandingStore()

/* RBAC：分组至少含一个可见菜单项、且数据范围放行该域时才渲染（避免空分组标题） */
function canSee(codes: string[], group: string, scopeDomain?: string): boolean {
  if (!scopeAllowsGroup(auth.dataScope, auth.permissions, group, scopeDomain)) return false
  return codes.some((code) => auth.hasPerm(code))
}

const collapsed = ref(false)
const compactViewport = window.matchMedia('(max-width: 1199px)')

function syncCompactSidebar(event: MediaQueryList | MediaQueryListEvent = compactViewport) {
  if (event.matches) collapsed.value = true
}

onMounted(() => {
  syncCompactSidebar()
  compactViewport.addEventListener('change', syncCompactSidebar)
  /* 站点品牌（左上角图标/名称 + 标签页图标）：已登录才拉取，避免登录页多一次无效请求 */
  if (auth.token) void branding.load()
})
onBeforeUnmount(() => {
  compactViewport.removeEventListener('change', syncCompactSidebar)
})

/* ---------- 菜单分组展开/折叠（受控）：低频组（积分管理/规则管理/系统管理）默认折叠 ---------- */
const ALL_GROUP_KEYS = ['group-commerce', 'group-members', 'group-biz', 'group-points', 'group-rules', 'group-space', 'group-contents', 'group-system', 'group-messaging']
const DEFAULT_COLLAPSED_GROUPS = ['group-points', 'group-rules', 'group-system']
const expandedMenus = ref<string[]>(ALL_GROUP_KEYS.filter((k) => !DEFAULT_COLLAPSED_GROUPS.includes(k)))
const isAllExpanded = computed(() => expandedMenus.value.length >= ALL_GROUP_KEYS.length)

function toggleAllGroups() {
  expandedMenus.value = isAllExpanded.value ? [] : [...ALL_GROUP_KEYS]
}

/* 跳转到某页面时自动展开其所属一级菜单（meta.group 中文名 → 分组 key）；
 * 仅在该组折叠时追加展开，不收起其他组；immediate 覆盖刷新直达场景 */
const GROUP_KEY_BY_META: Record<string, string> = {
  交易经营: 'group-commerce',
  社区成员: 'group-members',
  业务运营: 'group-biz',
  空间管理: 'group-space',
  内容管理: 'group-contents',
  积分管理: 'group-points',
  规则管理: 'group-rules',
  系统管理: 'group-system',
}

watch(
  () => route.meta.group,
  (group) => {
    const key = GROUP_KEY_BY_META[group as string]
    if (key && !expandedMenus.value.includes(key)) {
      expandedMenus.value = [...expandedMenus.value, key]
    }
  },
  { immediate: true },
)

/* 激活态唯一机制：当前路由归一化（详情路由 → 列表路由） */
const activePath = computed(() => {
  const p = route.path
  if (p.startsWith('/users')) return '/users'
  if (p.startsWith('/individuals')) return '/individuals'
  if (p.startsWith('/enterprises')) return '/enterprises'
  if (p.startsWith('/external-enterprises')) return '/external-enterprises'
  if (p === '/demands/review') return '/demands/review'
  if (p === '/demands/responses') return '/demands/responses'
  if (p.startsWith('/demands')) return '/demands'
  if (p === '/spaces/reservations') return '/spaces/reservations'
  if (p.startsWith('/spaces/')) return '/spaces'
  if (p.startsWith('/workstations/leases/')) return '/workstations/leases'
  if (p.startsWith('/projects')) return '/projects'
  if (p === '/events/enrollments') return '/events/enrollments'
  if (p.startsWith('/events')) return '/events'
  if (p.startsWith('/assets')) return '/assets/library'
  if (p.startsWith('/system')) return p
  if (p.startsWith('/logs')) return p
  return p
})

/* ---------- 通知中心（顶栏铃铛） ---------- */
const noticeVisible = ref(false)
const noticeList = ref<AdminNotification[]>([])
const unreadCount = computed(() => noticeList.value.filter((n) => !n.read).length)

function focusMainContent() {
  document.getElementById('main-content')?.focus()
}

const noticeError = ref('')
const noticeLoading = ref(false)

async function loadNotifications() {
  noticeLoading.value = true
  try {
    noticeList.value = await fetchNotifications()
    noticeError.value = ''
  } catch (error) {
    noticeError.value = error instanceof Error ? error.message : '通知加载失败'
  } finally {
    noticeLoading.value = false
  }
}

async function onNoticeClick(item: AdminNotification) {
  if (!item.read) {
    try {
      await markNotificationRead(item.id)
      item.read = true
    } catch {
      MessagePlugin.error('标记已读失败，请重试')
    }
  }
  noticeVisible.value = false
}

async function onReadAll() {
  try {
    await markAllNotificationsRead()
    noticeList.value = noticeList.value.map((n) => ({ ...n, read: true }))
    MessagePlugin.success('全部通知已标记为已读')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '标记已读失败，请重试')
  }
}

onMounted(loadNotifications)

/* 路由变化 → 同步多标签页 */
watch(
  () => route.fullPath,
  async () => {
    const path = route.path
    if (path !== '/login') {
      tabs.add({
        path,
        fullPath: route.fullPath,
        title: (route.meta.title as string) || '页面',
        closable: path !== '/dashboard',
      })
    }
  },
  { immediate: true },
)

function changePageTab(value: string | number) {
  const tab = tabs.tabs.find((item) => item.path === value)
  if (tab && tab.path !== route.path) void router.push(tab.fullPath)
}

function removePageTab(options: { value: string | number }) {
  void closeTab(String(options.value))
}

async function closeTab(path: string) {
  const item = tabs.tabs.find(tab => tab.path === path)
  if (!item?.closable) return
  if (route.path === path) {
    const remaining = tabs.tabs.filter(tab => tab.path !== path)
    const index = tabs.tabs.findIndex(tab => tab.path === path)
    const next = remaining[Math.min(index, remaining.length - 1)]?.fullPath ?? '/dashboard'
    // 导航保护被用户取消时保留当前标签及其查询条件。
    const failure = await router.push(next)
    if (failure) return
  }
  tabs.remove(path)
}

/* 关闭其他：关闭除当前页外的所有标签（工作台始终保留），保持在当前页 */
function closeAllTabs() {
  tabs.closeOthers(route.path)
}

const dropdownOptions = [
  { content: '修改密码', value: 'change-password' },
  { content: '退出登录', value: 'logout' },
]

async function handleDropdown(item: { value?: string | number }) {
  if (item.value === 'change-password') {
    router.push('/system/change-password')
    return
  }
  if (item.value === 'logout') {
    try {
      await auth.logout()
    } catch {
      /* 登出接口失败：本地登录态已由 resetAuth 兜底清理，仍需提示并离开 */
      MessagePlugin.error('退出登录失败，已清除本地登录状态')
    } finally {
      tabs.clear()
      router.push('/login')
    }
  }
}
</script>

<template>
  <div class="admin-shell">
    <t-link class="skip-link" href="#main-content" @click.prevent="focusMainContent">跳到主要内容</t-link>
    <!-- 侧栏 -->
    <aside class="side-col" :class="{ collapsed }" aria-label="主导航">
      <t-link theme="default" hover="color"
        class="side-logo"
        aria-label="返回工作台"
        href="#/dashboard"
      >
        <!-- 品牌标识：站点 logo（系统配置 > 站点信息）优先，未配置时回退内置字标（色值为品牌资产，刻意不随主题切换） -->
        <img v-if="branding.siteLogo" class="logo-mark logo-img" :src="branding.siteLogo" alt="" aria-hidden="true" />
        <svg v-else class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0052D9" />
          <circle cx="12.5" cy="14" r="5" fill="#7BD8F5" />
          <circle cx="20.5" cy="10.5" r="3.2" fill="#FFFFFF" />
          <path d="M5 23c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 5-2.4 7.5 0" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
        <span v-if="!collapsed" class="logo-text">{{ branding.siteName }}</span>
      </t-link>

      <!-- 菜单项在渲染前按权限过滤；折叠时根节点变为 Tooltip，不能依赖根节点权限指令。 -->
      <div class="side-menu">
        <t-menu
          :value="activePath"
          :collapsed="collapsed"
          v-model:expanded="expandedMenus"
          :theme="theme.mode"
        >
          <t-menu-item value="/dashboard" to="/dashboard" router-link>
            <template #icon><DashboardIcon /></template>
            工作台
          </t-menu-item>

          <!-- 一级菜单：用户留言（客户端留言的查看与回复），置于工作台之下 -->
          <t-menu-item v-if="auth.hasPerm('/user-messages')" value="/user-messages" to="/user-messages" router-link>
            <template #icon><ChatIcon /></template>
            用户留言
          </t-menu-item>

          <t-submenu v-if="canSee(['/users', '/individuals', '/enterprises', '/external-enterprises', '/approvals'], '社区成员')" value="group-members" title="社区成员">
            <template #icon><UserCircleIcon /></template>
            <t-menu-item v-if="auth.hasPerm('/users')" value="/users" to="/users" router-link>
              <template #icon><UserListIcon /></template>
              用户管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/individuals')" value="/individuals" to="/individuals" router-link>
              <template #icon><UserIcon /></template>
              社区个体
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/enterprises')" value="/enterprises" to="/enterprises" router-link>
              <template #icon><BuildingIcon /></template>
              社区企业
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/external-enterprises')" value="/external-enterprises" to="/external-enterprises" router-link>
              <template #icon><Building1Icon /></template>
              合作企业
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/approvals')" value="/approvals" to="/approvals" router-link>
              <template #icon><CheckCircleIcon /></template>
              申请审核
            </t-menu-item>
          </t-submenu>

          <t-submenu v-if="canSee(['/demands', '/demands/review', '/demands/responses', '/projects', '/events', '/events/enrollments'], '业务运营')" value="group-biz" title="业务运营">
            <template #icon><ViewListIcon /></template>
            <t-menu-item v-if="auth.hasPerm('/demands')" value="/demands" to="/demands" router-link>
              <template #icon><ViewListIcon /></template>
              需求管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/demands/review')" value="/demands/review" to="/demands/review" router-link>
              <template #icon><CheckCircleIcon /></template>
              需求审核
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/demands/responses')" value="/demands/responses" to="/demands/responses" router-link>
              <template #icon><CheckCircleIcon /></template>
              响应审核
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/projects')" value="/projects" to="/projects" router-link>
              <template #icon><AppIcon /></template>
              项目管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/events')" value="/events" to="/events" router-link>
              <template #icon><CalendarIcon /></template>
              活动管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/events')" value="/events/enrollments" to="/events/enrollments" router-link>
              <template #icon><CheckCircleIcon /></template>
              活动报名
            </t-menu-item>
          </t-submenu>

          <t-submenu
            v-if="canSee(['/workstations', '/workstations/offices', '/workstations/leases', '/spaces', '/spaces/reservations'], '空间管理')"
            value="group-space"
            title="空间管理"
          >
            <template #icon><MapIcon /></template>
            <t-menu-item v-if="auth.hasPerm('/workstations')" value="/workstations" to="/workstations" router-link>
              <template #icon><ViewModuleIcon /></template>
              办公位管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/workstations/offices')" value="/workstations/offices" to="/workstations/offices" router-link>
              <template #icon><BuildingIcon /></template>
              办公室管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/workstations/leases')" value="/workstations/leases" to="/workstations/leases" router-link>
              <template #icon><ViewListIcon /></template>
              租赁管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/spaces')" value="/spaces" to="/spaces" router-link>
              <template #icon><MapIcon /></template>
              公共空间管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/spaces/reservations')" value="/spaces/reservations" to="/spaces/reservations" router-link>
              <template #icon><CalendarIcon /></template>
              公共空间预约
            </t-menu-item>
          </t-submenu>

          <t-submenu
            v-if="canSee(['/contents/publish', '/contents/submissions', '/contents/columns', '/contents/stats', '/contents/policies', '/contents/banners', '/contents/announcements'], '内容管理')"
            value="group-contents"
            title="内容管理"
          >
            <template #icon><Edit2Icon /></template>
            <t-menu-item v-if="auth.hasPerm('/contents/publish')" value="/contents/publish" to="/contents/publish" router-link>
              <template #icon><Edit2Icon /></template>
              资讯发布
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/contents/submissions')" value="/contents/submissions" to="/contents/submissions" router-link>
              <template #icon><ViewListIcon /></template>
              投稿内容
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/contents/columns')" value="/contents/columns" to="/contents/columns" router-link>
              <template #icon><ViewModuleIcon /></template>
              栏目管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/contents/stats')" value="/contents/stats" to="/contents/stats" router-link>
              <template #icon><AppIcon /></template>
              阅读统计
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/contents/policies')" value="/contents/policies" to="/contents/policies" router-link>
              <template #icon><ViewListIcon /></template>
              社区政策
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/contents/banners')" value="/contents/banners" to="/contents/banners" router-link>
              <template #icon><ViewModuleIcon /></template>
              轮播图管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/contents/announcements')" value="/contents/announcements" to="/contents/announcements" router-link>
              <template #icon><NotificationIcon /></template>
              首页公告
            </t-menu-item>
          </t-submenu>

          <t-submenu v-if="canSee(['/commerce/overview', '/commerce/receivables'], '交易经营')" value="group-commerce" title="交易经营">
            <template #icon><ViewListIcon /></template>
            <t-menu-item v-if="auth.hasPerm('/commerce/overview')" value="/commerce/overview" to="/commerce/overview" router-link>经营概览</t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/commerce/receivables')" value="/commerce/receivables" to="/commerce/receivables" router-link>应收与交易</t-menu-item>
          </t-submenu>
          <t-submenu v-if="canSee(['/mall/goods', '/mall/orders'], '积分管理')" value="group-points" title="积分商城">
            <template #icon><CartIcon /></template>
            <t-menu-item v-if="auth.hasPerm('/mall/goods')" value="/mall/goods" to="/mall/goods" router-link>
              <template #icon><CartIcon /></template>
              商品管理
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/mall/orders')" value="/mall/orders" to="/mall/orders" router-link>
              <template #icon><ViewListIcon /></template>
              订单管理
            </t-menu-item>
          </t-submenu>

          <t-submenu
            v-if="canSee(['/rules/points', '/rules/experience', '/rules/levels', '/rules/publishing-limits'], '规则管理')"
            value="group-rules"
            title="规则管理"
          >
            <template #icon><SettingIcon /></template>
            <t-menu-item v-if="auth.hasPerm('/rules/points')" value="/rules/points" to="/rules/points" router-link>
              <template #icon><Edit2Icon /></template>
              积分规则
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/rules/experience')" value="/rules/experience" to="/rules/experience" router-link>
              <template #icon><ViewListIcon /></template>
              经验值规则
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/rules/levels')" value="/rules/levels" to="/rules/levels" router-link>
              <template #icon><ViewModuleIcon /></template>
              等级规则
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/rules/publishing-limits')" value="/rules/publishing-limits" to="/rules/publishing-limits" router-link>
              <template #icon><SettingIcon /></template>
              个人用户规则
            </t-menu-item>
          </t-submenu>

          <t-submenu
            v-if="canSee(['/system/config', '/logs/audit', '/logs/login', '/system/roles', '/system/admins', '/system/sessions', '/system/assets', '/system/monitor', '/system/trash', '/system/policies', '/system/messages'], '系统管理') || canSee(['/approvals', '/member-governance'], '系统管理', 'members')"
            value="group-system"
            title="系统管理"
          >
            <template #icon><LayersIcon /></template>
            <t-menu-item v-if="auth.hasPerm(['/system/config', '/system/messages', '/system/trash'])" value="/system/config" to="/system/config" router-link>
              <template #icon><SettingIcon /></template>
              系统配置
            </t-menu-item>
            <t-menu-item v-if="(canSee(['/approvals'], '系统管理', 'members')) && auth.hasPerm('/approvals')" value="/system/application-form-config" to="/system/application-form-config" router-link>
              <template #icon><CheckCircleIcon /></template>
              申请表单配置
            </t-menu-item>
            <t-menu-item v-if="(canSee(['/member-governance'], '系统管理', 'members')) && auth.hasPerm('/member-governance')" value="/system/deletion-requests" to="/system/deletion-requests" router-link><template #icon><CheckCircleIcon /></template>注销工单</t-menu-item>
            <t-menu-item v-if="auth.hasPerm(['/logs/audit', '/logs/login'])" value="/system/logs" to="/system/logs" router-link>
              <template #icon><ViewListIcon /></template>
              日志与审计
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm(['/system/admins', '/system/roles', '/system/sessions'])" value="/system/account" to="/system/account" router-link>
              <template #icon><UserListIcon /></template>
              角色与账号
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/system/assets')" value="/assets/library" to="/assets/library" router-link>
              <template #icon><ViewModuleIcon /></template>
              素材库
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/system/monitor')" value="/system/monitor" to="/system/monitor" router-link>
              <template #icon><DashboardIcon /></template>
              系统监控
            </t-menu-item>
            <t-menu-item v-if="auth.hasPerm('/system/policies')" value="/system/policies" to="/system/policies" router-link><template #icon><Edit2Icon /></template>协议与政策</t-menu-item>
            <!-- 关于：站点信息 + 开发者联系方式（信息页，无需权限码，口径同「工作台」） -->
            <t-menu-item value="/system/about" to="/system/about" router-link>
              <template #icon><InfoCircleIcon /></template>
              关于
            </t-menu-item>
          </t-submenu>
        </t-menu>
      </div>

      <div class="side-footer">
        <!-- 使用 TDesign Button 保持键盘行为和交互尺寸一致。 -->
        <t-button variant="text" theme="default" class="footer-btn" :aria-label="isAllExpanded ? '全部折叠' : '全部展开'" @click="toggleAllGroups">
          <ChevronUpIcon v-if="isAllExpanded" />
          <ChevronDownIcon v-else />
          <span v-if="!collapsed">{{ isAllExpanded ? '全部折叠' : '全部展开' }}</span>
        </t-button>
        <t-button variant="text" theme="default" class="footer-btn" :aria-label="collapsed ? '展开菜单' : '收起菜单'" @click="collapsed = !collapsed">
          <ChevronLeftIcon :class="{ 'rotate-180': collapsed }" />
          <span v-if="!collapsed">收起菜单</span>
        </t-button>
      </div>
    </aside>

    <!-- 主区 -->
    <div class="main-col">
      <header class="top-bar">
        <t-button
          variant="text"
          size="small"
          class="tab-close-all"
          :disabled="!tabs.tabs.some(tab => tab.closable && tab.path !== route.path)"
          @click="closeAllTabs"
        >
          <template #icon><CloseIcon /></template>
          关闭其他
        </t-button>
        <t-tabs
          class="page-tabs"
          :value="route.path"
          theme="card"
          scroll-position="auto"
          aria-label="已打开页面"
          @change="changePageTab"
          @remove="removePageTab"
        >
          <t-tab-panel v-for="tab in tabs.tabs" :key="tab.path" :value="tab.path" :label="tab.title" :removable="tab.closable" />
        </t-tabs>
        <div class="top-right">
          <t-button
            variant="text"
            shape="square"
            class="theme-btn"
            :title="theme.mode === 'dark' ? '切换浅色模式' : '切换暗色模式'"
            :aria-label="theme.mode === 'dark' ? '切换浅色模式' : '切换暗色模式'"
            :aria-pressed="theme.mode === 'dark'"
            @click="theme.toggle()"
          >
            <template #icon>
              <component :is="theme.mode === 'dark' ? SunnyIcon : MoonIcon" />
            </template>
          </t-button>
          <t-popup
            v-model:visible="noticeVisible"
            trigger="click"
            placement="bottom-right"
            :show-arrow="false"
          >
            <t-badge :count="unreadCount" :offset="[4, 8]">
              <t-button
                variant="text"
                shape="square"
                class="notice-btn"
                aria-label="通知中心"
                :aria-expanded="noticeVisible"
              >
                <template #icon><NotificationIcon /></template>
              </t-button>
            </t-badge>
            <template #content>
              <div class="notice-panel">
                <div class="notice-head">
                  <span class="notice-title">通知中心</span>
                  <t-button v-if="unreadCount > 0" theme="primary" variant="text" size="small" @click="onReadAll">全部已读</t-button>
                </div>
                <div class="notice-list">
                  <!-- 加载中给骨架容器，避免首次打开浮层时整块空白 -->
                  <t-loading :loading="noticeLoading" size="small" class="notice-body">
                    <ListErrorState v-if="noticeError" :message="noticeError" :loading="noticeLoading" @retry="loadNotifications" />
                    <t-link theme="default" hover="color"
                      v-for="n in noticeList"
                      :key="n.id"
                      class="notice-item"
                      :class="{ 'is-unread': !n.read }"
                      :href="n.link ? router.resolve(n.link).href : undefined"
                      :role="n.link ? undefined : 'button'"
                      :tabindex="n.link ? undefined : 0"
                      @click="onNoticeClick(n)"
                      @keydown.enter.space="!n.link && onNoticeClick(n)"
                    >
                      <div class="notice-item-head">
                        <span class="notice-dot" v-if="!n.read"></span>
                        <span class="notice-item-title">{{ n.title }}</span>
                      </div>
                      <!-- 正文限 2 行截断，补原生 title 以便悬停查看完整内容 -->
                      <div class="notice-item-content" :title="n.content">{{ n.content }}</div>
                      <div class="notice-item-time">{{ n.at }}</div>
                    </t-link>
                    <t-empty v-if="!noticeError && !noticeLoading && !noticeList.length" description="暂无通知" size="small" />
                  </t-loading>
                </div>
              </div>
            </template>
          </t-popup>
          <t-dropdown :options="dropdownOptions" trigger="click" @click="handleDropdown">
            <t-button variant="text" theme="default" class="admin-chip" aria-label="管理员菜单">
              <t-avatar size="28px">{{ auth.name.slice(0, 1) }}</t-avatar>
              <span class="admin-name">{{ auth.name || '管理员' }}</span>
            </t-button>
          </t-dropdown>
        </div>
      </header>

      <main id="main-content" class="page-scroll" tabindex="-1">
        <router-view v-slot="{ Component, route: viewRoute }">
          <transition name="page" mode="out-in">
            <!-- path 已包含详情实体 ID，可在实体切换时重挂载；query（筛选/选项卡）变化不应销毁整个页面。 -->
            <component :is="Component" :key="viewRoute.path" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: auto 1fr;
  height: 100vh;
  overflow: hidden;
}

.skip-link {
  position: fixed;
  z-index: 4000;
  top: 8px;
  left: 8px;
  padding: 8px 12px;
  color: var(--td-text-color-anti);
  background: var(--td-brand-color);
  border-radius: var(--td-radius-default);
  transform: translateY(-150%);
}

.skip-link:focus {
  transform: translateY(0);
}

/* ---------- 侧栏 ---------- */
.side-col {
  display: flex;
  flex-direction: column;
  width: var(--app-sidebar-w);
  background: var(--td-bg-color-container);
  border-right: 1px solid var(--td-component-border);
  transition: width 200ms ease;
  overflow: hidden;
}

.side-col.collapsed {
  width: var(--app-sidebar-w-collapsed);
}

.side-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 16px;
  cursor: pointer;
  flex-shrink: 0;
  border-bottom: 1px solid var(--td-component-border);
}

.logo-mark {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  white-space: nowrap;
}

/* 站点 logo（系统配置 > 站点信息上传）：与内置字标同尺寸，按方形等比裁切避免拉伸变形 */
.logo-img {
  object-fit: contain;
  border-radius: var(--td-radius-small);
}

.side-col.collapsed .side-logo {
  justify-content: center;
  padding: 0;
}

.side-menu {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.side-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 10px;
  border-top: 1px solid var(--td-component-border);
  flex-shrink: 0;
}

/* 侧栏底部操作按钮：图标靠前、文字跟随；收起态仅显示图标居中。
 * 使用 TDesign 文字按钮，保持紧凑尺寸与主题语义色。 */
.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 6px;
  background: none;
  border: none;
  border-radius: var(--td-radius-default);
  font-family: inherit;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;
}

.side-col:not(.collapsed) .footer-btn:first-child {
  margin-right: auto;
}

.footer-btn:hover {
  color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}

.footer-btn :deep(.t-button__text),
.admin-chip :deep(.t-button__text) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.side-col.collapsed .side-footer {
  justify-content: space-around;
  padding: 0;
}

.rotate-180 {
  transform: rotate(180deg);
}

/* ---------- 顶栏 ---------- */
.main-col {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--app-topbar-h);
  padding: 0 8px;
  background: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-border);
  flex-shrink: 0;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-left: 4px;
}

/* ---------- 通知中心 ---------- */
.notice-btn {
  font-size: 18px;
  color: var(--td-text-color-secondary);
}

.theme-btn {
  font-size: 18px;
  color: var(--td-text-color-secondary);
}

.notice-panel {
  width: 340px;
  /* 窄屏浮层不能横向溢出视口 */
  max-width: calc(100vw - 24px);
}

.notice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--td-component-border);
}

.notice-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.notice-list {
  max-height: 380px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.notice-body {
  /* 加载遮罩需要可用高度，否则空列表下只剩一条细缝 */
  min-height: 96px;
}

.notice-item {
  display: block;
  white-space: normal;
  text-align: left;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--td-component-stroke);
  transition: background 120ms ease;
}

.notice-item:hover {
  background: var(--td-bg-color-container-hover);
}

.notice-item.is-unread {
  background: var(--td-brand-color-1);
}

.notice-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.notice-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--td-error-color);
  flex-shrink: 0;
}

.notice-item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.notice-item-content {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notice-item-time {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

/* ---------- 管理员入口 ---------- */
.admin-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--td-radius-medium);
}

.admin-chip:hover {
  background: var(--td-bg-color-container-hover);
}

.admin-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

/* ---------- TDesign 页面页签 ---------- */
.page-tabs { flex: 1; min-width: 0; }
.page-tabs :deep(.t-tabs__content) { display: none; }
.page-tabs :deep(.t-tabs__nav-container) { background: var(--td-bg-color-container); }

.tab-close-all {
  flex-shrink: 0;
  margin-right: 8px;
  color: var(--td-text-color-secondary);
}

.tab-close-all:not(.t-is-disabled):hover {
  color: var(--td-text-color-primary);
}



/* ---------- 内容区 ---------- */
.page-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--td-bg-color-page);
}

/* 窄屏收紧内容边距 */
@media (max-width: 767px) {
  .page-scroll {
    padding: 12px;
  }
}
</style>
