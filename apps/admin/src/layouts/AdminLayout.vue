<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppIcon,
  Building1Icon,
  BuildingIcon,
  CalendarIcon,
  CartIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CloseIcon,
  DashboardIcon,
  Edit2Icon,
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
  measureTabScroll()
  window.addEventListener('resize', measureTabScroll)
})
onBeforeUnmount(() => {
  compactViewport.removeEventListener('change', syncCompactSidebar)
  window.removeEventListener('resize', measureTabScroll)
})

/* ---------- 菜单分组展开/折叠（受控）：低频组（积分管理/规则管理/系统管理）默认折叠 ---------- */
const ALL_GROUP_KEYS = ['group-members', 'group-biz', 'group-points', 'group-rules', 'group-space', 'group-contents', 'group-system', 'group-messaging']
const DEFAULT_COLLAPSED_GROUPS = ['group-points', 'group-rules', 'group-system']
const expandedMenus = ref<string[]>(ALL_GROUP_KEYS.filter((k) => !DEFAULT_COLLAPSED_GROUPS.includes(k)))
const isAllExpanded = computed(() => expandedMenus.value.length >= ALL_GROUP_KEYS.length)

function toggleAllGroups() {
  expandedMenus.value = isAllExpanded.value ? [] : [...ALL_GROUP_KEYS]
}

/* 跳转到某页面时自动展开其所属一级菜单（meta.group 中文名 → 分组 key）；
 * 仅在该组折叠时追加展开，不收起其他组；immediate 覆盖刷新直达场景 */
const GROUP_KEY_BY_META: Record<string, string> = {
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

const tabBarRef = ref<HTMLElement | null>(null)
const tabTrackRef = ref<HTMLElement | null>(null)
/* 标签栏采用 transform 位移动画（参考 TDesign Tabs 的导航滑动实现）：
 * 容器 overflow:hidden + 轨道 translate3d，滚轮始终把纵向增量转成横向位移 */
const tabScrollLeft = ref(0)
const tabMaxScroll = ref(0)

const tabTrackStyle = computed(() => ({ transform: `translate3d(${-tabScrollLeft.value}px, 0, 0)` }))

function clampTabOffset(value: number) {
  return Math.max(0, Math.min(value, tabMaxScroll.value))
}

function setTabOffset(value: number) {
  tabScrollLeft.value = clampTabOffset(value)
}

function measureTabScroll() {
  const bar = tabBarRef.value
  const track = tabTrackRef.value
  if (!bar || !track) return
  const style = getComputedStyle(bar)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  tabMaxScroll.value = Math.max(0, track.scrollWidth - (bar.clientWidth - padding))
  setTabOffset(tabScrollLeft.value)
}

function handleTabBarWheel(event: WheelEvent) {
  if (tabMaxScroll.value <= 0) return
  event.preventDefault()
  const { deltaX, deltaY } = event
  setTabOffset(tabScrollLeft.value + (Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY))
}

async function revealActiveTab() {
  await nextTick()
  measureTabScroll()
  const bar = tabBarRef.value
  const track = tabTrackRef.value
  if (!bar || !track) return
  const active = track.querySelector<HTMLElement>('.tab-item.active')
  if (!active) return
  const left = active.offsetLeft
  const right = left + active.offsetWidth
  const viewLeft = tabScrollLeft.value
  const viewRight = viewLeft + bar.clientWidth
  if (left < viewLeft) setTabOffset(left)
  else if (right > viewRight) setTabOffset(right - bar.clientWidth)
}

/* 标签数量变化（新增/关闭）后重新测量可滚动范围 */
watch(
  () => tabs.tabs.length,
  () => nextTick(measureTabScroll),
)

/* 路由变化 → 同步多标签页 */
watch(
  () => route.path,
  async (path) => {
    if (path !== '/login') {
      tabs.add({
        path,
        title: (route.meta.title as string) || '页面',
        closable: path !== '/dashboard',
      })
    }
    await revealActiveTab()
  },
  { immediate: true },
)

function handleMenuChange(value: string) {
  if (value !== route.path) router.push(value)
}

function closeTab(path: string) {
  const next = tabs.remove(path)
  if (route.path === path && next) router.push(next)
}

/* 全部关闭：关闭除当前页外的所有标签（工作台始终保留），保持在当前页 */
function closeAllTabs() {
  tabs.closeOthers(route.path)
}

function clickCurrentTarget(event: KeyboardEvent) {
  ;(event.currentTarget as HTMLElement | null)?.click()
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
        <svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0052D9" />
          <circle cx="12.5" cy="14" r="5" fill="#7BD8F5" />
          <circle cx="20.5" cy="10.5" r="3.2" fill="#FFFFFF" />
          <path d="M5 23c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 5-2.4 7.5 0" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
        <span v-if="!collapsed" class="logo-text">聚屿社区</span>
      </t-link>

      <div class="side-menu">
        <t-menu
          :value="activePath"
          :collapsed="collapsed"
          v-model:expanded="expandedMenus"
          :theme="theme.mode"
          @change="handleMenuChange"
        >
          <t-menu-item value="/dashboard">
            <template #icon><DashboardIcon /></template>
            工作台
          </t-menu-item>

          <t-submenu v-if="canSee(['/users', '/individuals', '/enterprises', '/external-enterprises', '/approvals', '/card-management'], '社区成员')" value="group-members" title="社区成员">
            <template #icon><UserCircleIcon /></template>
            <t-menu-item value="/users" v-permission="'/users'">
              <template #icon><UserListIcon /></template>
              用户管理
            </t-menu-item>
            <t-menu-item value="/individuals" v-permission="'/individuals'">
              <template #icon><UserIcon /></template>
              社区个体
            </t-menu-item>
            <t-menu-item value="/enterprises" v-permission="'/enterprises'">
              <template #icon><BuildingIcon /></template>
              社区企业
            </t-menu-item>
            <t-menu-item value="/external-enterprises" v-permission="'/external-enterprises'">
              <template #icon><Building1Icon /></template>
              合作企业
            </t-menu-item>
            <t-menu-item value="/approvals" v-permission="'/approvals'">
              <template #icon><CheckCircleIcon /></template>
              申请审核
            </t-menu-item>
            <t-menu-item value="/card-management" v-permission="'/card-management'"><template #icon><UserListIcon /></template>名片管理</t-menu-item>
          </t-submenu>

          <t-submenu v-if="canSee(['/demands', '/demands/review', '/projects', '/events', '/events/enrollments'], '业务运营')" value="group-biz" title="业务运营">
            <template #icon><ViewListIcon /></template>
            <t-menu-item value="/demands" v-permission="'/demands'">
              <template #icon><ViewListIcon /></template>
              需求管理
            </t-menu-item>
            <t-menu-item value="/demands/review" v-permission="'/demands/review'">
              <template #icon><CheckCircleIcon /></template>
              需求审核
            </t-menu-item>
            <t-menu-item value="/projects" v-permission="'/projects'">
              <template #icon><AppIcon /></template>
              项目管理
            </t-menu-item>
            <t-menu-item value="/events" v-permission="'/events'">
              <template #icon><CalendarIcon /></template>
              活动管理
            </t-menu-item>
            <t-menu-item value="/events/enrollments" v-permission="'/events'">
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
            <t-menu-item value="/workstations" v-permission="'/workstations'">
              <template #icon><ViewModuleIcon /></template>
              办公位管理
            </t-menu-item>
            <t-menu-item value="/workstations/offices" v-permission="'/workstations/offices'">
              <template #icon><BuildingIcon /></template>
              办公室管理
            </t-menu-item>
            <t-menu-item value="/workstations/leases" v-permission="'/workstations/leases'">
              <template #icon><ViewListIcon /></template>
              租赁管理
            </t-menu-item>
            <t-menu-item value="/spaces" v-permission="'/spaces'">
              <template #icon><MapIcon /></template>
              公共空间管理
            </t-menu-item>
            <t-menu-item value="/spaces/reservations" v-permission="'/spaces/reservations'">
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
            <t-menu-item value="/contents/publish" v-permission="'/contents/publish'">
              <template #icon><Edit2Icon /></template>
              资讯发布
            </t-menu-item>
            <t-menu-item value="/contents/submissions" v-permission="'/contents/submissions'">
              <template #icon><ViewListIcon /></template>
              投稿内容
            </t-menu-item>
            <t-menu-item value="/contents/columns" v-permission="'/contents/columns'">
              <template #icon><ViewModuleIcon /></template>
              栏目管理
            </t-menu-item>
            <t-menu-item value="/contents/stats" v-permission="'/contents/stats'">
              <template #icon><AppIcon /></template>
              阅读统计
            </t-menu-item>
            <t-menu-item value="/contents/policies" v-permission="'/contents/policies'">
              <template #icon><ViewListIcon /></template>
              社区政策
            </t-menu-item>
            <t-menu-item value="/contents/banners" v-permission="'/contents/banners'">
              <template #icon><ViewModuleIcon /></template>
              轮播图管理
            </t-menu-item>
            <t-menu-item value="/contents/announcements" v-permission="'/contents/announcements'">
              <template #icon><NotificationIcon /></template>
              首页公告
            </t-menu-item>
          </t-submenu>

          <t-submenu v-if="canSee(['/mall/goods', '/mall/orders'], '积分管理')" value="group-points" title="积分商城">
            <template #icon><CartIcon /></template>
            <t-menu-item value="/mall/goods" v-permission="'/mall/goods'">
              <template #icon><CartIcon /></template>
              商品管理
            </t-menu-item>
            <t-menu-item value="/mall/orders" v-permission="'/mall/orders'">
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
            <t-menu-item value="/rules/points" v-permission="'/rules/points'">
              <template #icon><Edit2Icon /></template>
              积分规则
            </t-menu-item>
            <t-menu-item value="/rules/experience" v-permission="'/rules/experience'">
              <template #icon><ViewListIcon /></template>
              经验值规则
            </t-menu-item>
            <t-menu-item value="/rules/levels" v-permission="'/rules/levels'">
              <template #icon><ViewModuleIcon /></template>
              等级规则
            </t-menu-item>
            <t-menu-item value="/rules/publishing-limits" v-permission="'/rules/publishing-limits'">
              <template #icon><SettingIcon /></template>
              发布限制
            </t-menu-item>
          </t-submenu>

          <t-submenu
            v-if="canSee(['/system/dicts', '/system/config', '/logs/audit', '/logs/login', '/system/roles', '/system/admins', '/system/sessions', '/system/assets', '/system/monitor', '/system/trash', '/system/policies', '/system/messages'], '系统管理') || canSee(['/approvals', '/member-governance'], '系统管理', 'members')"
            value="group-system"
            title="系统管理"
          >
            <template #icon><LayersIcon /></template>
            <t-menu-item value="/system/dicts" v-permission="'/system/dicts'">
              <template #icon><AppIcon /></template>
              数据字典
            </t-menu-item>
            <t-menu-item value="/system/config" v-permission="'/system/config'">
              <template #icon><SettingIcon /></template>
              系统配置
            </t-menu-item>
            <t-menu-item v-if="canSee(['/approvals'], '系统管理', 'members')" value="/system/application-form-config" v-permission="'/approvals'">
              <template #icon><CheckCircleIcon /></template>
              申请表单配置
            </t-menu-item>
            <t-menu-item v-if="canSee(['/member-governance'], '系统管理', 'members')" value="/system/deletion-requests" v-permission="'/member-governance'"><template #icon><CheckCircleIcon /></template>注销工单</t-menu-item>
            <t-menu-item value="/system/logs" v-permission="['/logs/audit', '/logs/login']">
              <template #icon><ViewListIcon /></template>
              日志与审计
            </t-menu-item>
            <t-menu-item value="/system/account" v-permission="['/system/admins', '/system/roles', '/system/sessions']">
              <template #icon><UserListIcon /></template>
              角色与账号
            </t-menu-item>
            <t-menu-item value="/assets/library" v-permission="'/system/assets'">
              <template #icon><ViewModuleIcon /></template>
              素材库
            </t-menu-item>
            <t-menu-item value="/system/monitor" v-permission="'/system/monitor'">
              <template #icon><DashboardIcon /></template>
              系统监控
            </t-menu-item>
            <t-menu-item value="/system/trash" v-permission="'/system/trash'">
              <template #icon><Edit2Icon /></template>
              归档管理
            </t-menu-item>
            <t-menu-item value="/system/policies" v-permission="'/system/policies'"><template #icon><Edit2Icon /></template>协议与政策</t-menu-item>
            <t-menu-item value="/system/messages" v-permission="'/system/messages'">
              <template #icon><NotificationIcon /></template>
              消息中心
            </t-menu-item>
          </t-submenu>
        </t-menu>
      </div>

      <div class="side-footer">
        <div class="footer-btn" role="button" tabindex="0" @click="toggleAllGroups" @keydown.enter.space.prevent="toggleAllGroups">
          <ChevronUpIcon v-if="isAllExpanded" />
          <ChevronDownIcon v-else />
          <span v-if="!collapsed">{{ isAllExpanded ? '全部折叠' : '全部展开' }}</span>
        </div>
        <div class="footer-btn" role="button" tabindex="0" @click="collapsed = !collapsed" @keydown.enter.space.prevent="collapsed = !collapsed">
          <ChevronLeftIcon :class="{ 'rotate-180': collapsed }" />
          <span v-if="!collapsed">收起菜单</span>
        </div>
      </div>
    </aside>

    <!-- 主区 -->
    <div class="main-col">
      <header class="top-bar">
        <t-button
          variant="text"
          size="small"
          class="tab-close-all"
          :disabled="tabs.tabs.length <= 1"
          @click="closeAllTabs"
        >
          <template #icon><CloseIcon /></template>
          全部关闭
        </t-button>
        <nav ref="tabBarRef" class="tab-bar" aria-label="已打开页面" @wheel="handleTabBarWheel">
          <div ref="tabTrackRef" class="tab-track" :style="tabTrackStyle">
            <div
              v-for="tab in tabs.tabs"
              :key="tab.path"
              class="tab-item"
              :class="{ active: tab.path === route.path }"
            >
              <t-link class="tab-title" theme="default" hover="color" :href="router.resolve(tab.path).href" :aria-current="tab.path === route.path ? 'page' : undefined">{{ tab.title }}</t-link>
              <span
                v-if="tab.closable"
                class="tab-close"
                role="button"
                tabindex="0"
                :aria-label="`关闭${tab.title}`"
                @click.stop="closeTab(tab.path)"
                @keydown.enter.space.stop.prevent="closeTab(tab.path)"
              >
                <CloseIcon />
              </span>
            </div>
          </div>
        </nav>
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
            v-model:popupVisible="noticeVisible"
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
                    <div class="notice-item-content">{{ n.content }}</div>
                    <div class="notice-item-time">{{ n.at }}</div>
                  </t-link>
                  <t-empty v-if="!noticeError && !noticeLoading && !noticeList.length" description="暂无通知" size="small" />
                </div>
              </div>
            </template>
          </t-popup>
          <t-dropdown :options="dropdownOptions" @click="handleDropdown">
            <div
              class="admin-chip"
              role="button"
              tabindex="0"
              aria-label="管理员菜单"
              @keydown.enter.space.prevent="clickCurrentTarget"
            >
              <t-avatar size="28px">{{ auth.name.slice(0, 1) }}</t-avatar>
              <span class="admin-name">{{ auth.name || '管理员' }}</span>
            </div>
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
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  white-space: nowrap;
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

/* 侧栏底部操作按钮：图标靠前、文字跟随；收起态仅显示图标居中 */
.footer-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 6px;
  border-radius: var(--td-radius-default);
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

.notice-item {
  display: block;
  white-space: normal;
  text-align: left;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--td-bg-color-page);
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
  font-size: 13px;
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

/* ---------- 多标签栏（随顶栏布局，内部滚动 + 右侧全部关闭） ---------- */
.tab-bar {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  overflow: hidden;
}

/* 轨道随滚轮横向位移（transform，参考 TDesign Tabs 导航滑动） */
.tab-track {
  display: flex;
  align-items: center;
  gap: 4px;
  will-change: transform;
  transition: transform 0.3s cubic-bezier(0.38, 0, 0.24, 1);
}

.tab-close-all {
  flex-shrink: 0;
  margin-right: 8px;
  color: var(--td-text-color-secondary);
}

.tab-close-all:not(.t-is-disabled):hover {
  color: var(--td-text-color-primary);
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  font-size: 12px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  white-space: nowrap;
  background: var(--td-bg-color-page);
  transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
}

.tab-item:hover {
  color: var(--td-brand-color);
}

.tab-item.active {
  color: var(--td-brand-color);
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.tab-title {
  white-space: nowrap;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--td-radius-default);
  color: var(--td-text-color-secondary);
  cursor: pointer;
}

.tab-close:hover {
  color: var(--td-error-color);
  background: var(--td-error-color-1);
}

/* ---------- 内容区 ---------- */
.page-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  background: var(--td-bg-color-page);
}
</style>
