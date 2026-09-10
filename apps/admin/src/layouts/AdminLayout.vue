<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
  NotificationIcon,
  SettingIcon,
  UserCircleIcon,
  UserIcon,
  UserListIcon,
  ViewListIcon,
  ViewModuleIcon,
} from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useTabsStore } from '@/stores/tabs'
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

const collapsed = ref(false)

/* ---------- 菜单分组展开/折叠（受控）：低频组（积分商城/规则管理/系统管理）默认折叠 ---------- */
const ALL_GROUP_KEYS = ['group-members', 'group-biz', 'group-points', 'group-rules', 'group-space', 'group-contents', 'group-system']
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
  if (p.startsWith('/projects')) return '/projects'
  if (p.startsWith('/events')) return '/events'
  if (p.startsWith('/system')) return p
  if (p.startsWith('/logs')) return '/logs/audit'
  return p
})

/* ---------- 通知中心（顶栏铃铛） ---------- */
const noticeVisible = ref(false)
const noticeList = ref<AdminNotification[]>([])
const unreadCount = computed(() => noticeList.value.filter((n) => !n.read).length)

async function loadNotifications() {
  try {
    noticeList.value = await fetchNotifications()
  } catch {
    /* 通知加载失败静默处理，不影响主流程 */
  }
}

async function onNoticeClick(item: AdminNotification) {
  if (!item.read) {
    item.read = true
    await markNotificationRead(item.id)
  }
  noticeVisible.value = false
  if (item.link) router.push(item.link)
}

async function onReadAll() {
  await markAllNotificationsRead()
  noticeList.value = noticeList.value.map((n) => ({ ...n, read: true }))
  MessagePlugin.success('全部通知已标记为已读')
}

onMounted(loadNotifications)

/* ---------- 面包屑：详情页第二级可点击返回列表 ---------- */
const detailListPath = computed(() => {
  const m = route.path.match(/^\/(users|enterprises|external-enterprises|demands|projects|events|spaces)\/[^/]+$/)
  return m ? `/${m[1]}` : ''
})

/* 路由变化 → 同步多标签页 */
watch(
  () => route.path,
  (path) => {
    if (path !== '/login') {
      tabs.add({
        path,
        title: (route.meta.title as string) || '页面',
        closable: path !== '/dashboard',
      })
    }
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

/* 全部关闭：清空标签仅保留工作台，并回到工作台 */
function closeAllTabs() {
  tabs.clear()
  router.push('/dashboard')
}

const dropdownOptions = [
  { content: '退出登录', value: 'logout' },
]

async function handleDropdown(item: { value?: string | number }) {
  if (item.value === 'logout') {
    await auth.logout()
    tabs.clear()
    router.push('/login')
  }
}
</script>

<template>
  <div class="admin-shell">
    <!-- 侧栏 -->
    <aside class="side-col" :class="{ collapsed }">
      <div class="side-logo" @click="router.push('/dashboard')">
        <svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#0052D9" />
          <circle cx="12.5" cy="14" r="5" fill="#7BD8F5" />
          <circle cx="20.5" cy="10.5" r="3.2" fill="#FFFFFF" />
          <path d="M5 23c2.5-2.4 5-2.4 7.5 0s5 2.4 7.5 0 5-2.4 7.5 0" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
        <span v-if="!collapsed" class="logo-text">聚屿社区</span>
      </div>

      <div class="side-menu">
        <t-menu
          :value="activePath"
          :collapsed="collapsed"
          v-model:expanded="expandedMenus"
          theme="light"
          @change="handleMenuChange"
        >
          <t-menu-item value="/dashboard">
            <template #icon><DashboardIcon /></template>
            工作台
          </t-menu-item>

          <t-submenu value="group-members" title="社区成员">
            <template #icon><UserCircleIcon /></template>
            <t-menu-item value="/users">
              <template #icon><UserListIcon /></template>
              用户管理
            </t-menu-item>
            <t-menu-item value="/individuals">
              <template #icon><UserIcon /></template>
              社区个体
            </t-menu-item>
            <t-menu-item value="/enterprises">
              <template #icon><BuildingIcon /></template>
              社区企业
            </t-menu-item>
            <t-menu-item value="/external-enterprises">
              <template #icon><Building1Icon /></template>
              外部企业
            </t-menu-item>
            <t-menu-item value="/approvals">
              <template #icon><CheckCircleIcon /></template>
              申请审批
            </t-menu-item>
          </t-submenu>

          <t-submenu value="group-biz" title="业务运营">
            <template #icon><ViewListIcon /></template>
            <t-menu-item value="/demands">
              <template #icon><ViewListIcon /></template>
              需求管理
            </t-menu-item>
            <t-menu-item value="/demands/review">
              <template #icon><CheckCircleIcon /></template>
              需求审核
            </t-menu-item>
            <t-menu-item value="/projects">
              <template #icon><AppIcon /></template>
              项目管理
            </t-menu-item>
            <t-menu-item value="/events">
              <template #icon><CalendarIcon /></template>
              活动管理
            </t-menu-item>
          </t-submenu>

          <t-submenu value="group-space" title="空间管理">
            <template #icon><MapIcon /></template>
            <t-menu-item value="/workstations">
              <template #icon><ViewModuleIcon /></template>
              办公位管理
            </t-menu-item>
            <t-menu-item value="/workstations/offices">
              <template #icon><BuildingIcon /></template>
              办公室管理
            </t-menu-item>
            <t-menu-item value="/workstations/leases">
              <template #icon><ViewListIcon /></template>
              租赁管理
            </t-menu-item>
            <t-menu-item value="/spaces">
              <template #icon><MapIcon /></template>
              公共空间管理
            </t-menu-item>
            <t-menu-item value="/spaces/reservations">
              <template #icon><CalendarIcon /></template>
              公共空间预约
            </t-menu-item>
          </t-submenu>

          <t-submenu value="group-contents" title="内容管理">
            <template #icon><Edit2Icon /></template>
            <t-menu-item value="/contents">
              <template #icon><Edit2Icon /></template>
              资讯内容
            </t-menu-item>
            <t-menu-item value="/contents/showcase">
              <template #icon><ViewListIcon /></template>
              展示页发布
            </t-menu-item>
            <t-menu-item value="/contents/announcements">
              <template #icon><NotificationIcon /></template>
              公告栏
            </t-menu-item>
          </t-submenu>

          <t-submenu value="group-points" title="积分商城">
            <template #icon><CartIcon /></template>
            <t-menu-item value="/mall/goods">
              <template #icon><CartIcon /></template>
              商品管理
            </t-menu-item>
            <t-menu-item value="/mall/orders">
              <template #icon><ViewListIcon /></template>
              订单管理
            </t-menu-item>
          </t-submenu>

          <t-submenu value="group-rules" title="规则管理">
            <template #icon><SettingIcon /></template>
            <t-menu-item value="/rules/points">
              <template #icon><Edit2Icon /></template>
              积分规则
            </t-menu-item>
            <t-menu-item value="/rules/experience">
              <template #icon><ViewListIcon /></template>
              经验值规则
            </t-menu-item>
            <t-menu-item value="/rules/levels">
              <template #icon><ViewModuleIcon /></template>
              等级规则
            </t-menu-item>
            <t-menu-item value="/rules/ledger">
              <template #icon><AppIcon /></template>
              积分发放记录
            </t-menu-item>
            <t-menu-item value="/rules/experience-records">
              <template #icon><ViewListIcon /></template>
              经验值发放记录
            </t-menu-item>
          </t-submenu>

          <t-submenu value="group-system" title="系统管理">
            <template #icon><LayersIcon /></template>
            <t-menu-item value="/system/dicts">
              <template #icon><AppIcon /></template>
              数据字典
            </t-menu-item>
            <t-menu-item value="/system/config">
              <template #icon><SettingIcon /></template>
              系统配置
            </t-menu-item>
            <t-menu-item value="/logs/audit">
              <template #icon><ViewListIcon /></template>
              审计日志
            </t-menu-item>
          </t-submenu>
        </t-menu>
      </div>

      <div class="side-footer">
        <div class="footer-btn" @click="toggleAllGroups">
          <ChevronUpIcon v-if="isAllExpanded" />
          <ChevronDownIcon v-else />
          <span v-if="!collapsed">{{ isAllExpanded ? '全部折叠' : '全部展开' }}</span>
        </div>
        <div class="footer-btn" @click="collapsed = !collapsed">
          <ChevronLeftIcon :class="{ 'rotate-180': collapsed }" />
          <span v-if="!collapsed">收起菜单</span>
        </div>
      </div>
    </aside>

    <!-- 主区 -->
    <div class="main-col">
      <header class="top-bar">
        <t-breadcrumb max-item-width="160">
          <t-breadcrumb-item>{{ (route.meta.group as string) || '聚屿社区' }}</t-breadcrumb-item>
          <t-breadcrumb-item
            :class="{ 'crumb-link': !!detailListPath }"
            @click="detailListPath && router.push(detailListPath)"
          >
            {{ route.meta.title as string }}
          </t-breadcrumb-item>
        </t-breadcrumb>
        <div class="top-right">
          <t-popup
            v-model:popupVisible="noticeVisible"
            trigger="click"
            placement="bottom-right"
            :show-arrow="false"
          >
            <t-badge :count="unreadCount" :offset="[4, 2]">
              <t-button variant="text" shape="square" class="notice-btn">
                <template #icon><NotificationIcon /></template>
              </t-button>
            </t-badge>
            <template #content>
              <div class="notice-panel">
                <div class="notice-head">
                  <span class="notice-title">通知中心</span>
                  <t-link v-if="unreadCount > 0" theme="primary" hover="color" @click="onReadAll">全部已读</t-link>
                </div>
                <div class="notice-list">
                  <div
                    v-for="n in noticeList"
                    :key="n.id"
                    class="notice-item"
                    :class="{ 'is-unread': !n.read }"
                    @click="onNoticeClick(n)"
                  >
                    <div class="notice-item-head">
                      <span class="notice-dot" v-if="!n.read"></span>
                      <span class="notice-item-title">{{ n.title }}</span>
                    </div>
                    <div class="notice-item-content">{{ n.content }}</div>
                    <div class="notice-item-time">{{ n.at }}</div>
                  </div>
                  <t-empty v-if="!noticeList.length" description="暂无通知" size="small" />
                </div>
              </div>
            </template>
          </t-popup>
          <t-dropdown :options="dropdownOptions" @click="handleDropdown">
            <div class="admin-chip">
              <t-avatar size="28px">{{ auth.name.slice(0, 1) }}</t-avatar>
              <span class="admin-name">{{ auth.name || '管理员' }}</span>
            </div>
          </t-dropdown>
        </div>
      </header>

      <div class="tab-bar-wrap">
        <div class="tab-bar">
          <div
            v-for="tab in tabs.tabs"
            :key="tab.path"
            class="tab-item"
            :class="{ active: tab.path === route.path }"
            @click="router.push(tab.path)"
          >
            <span class="tab-title">{{ tab.title }}</span>
            <span v-if="tab.closable" class="tab-close" @click.stop="closeTab(tab.path)">
              <CloseIcon />
            </span>
          </div>
        </div>
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
      </div>

      <main class="page-scroll">
        <router-view v-slot="{ Component, route: viewRoute }">
          <transition name="page" mode="out-in">
            <!-- key 绑定 fullPath：同路由不同参数（如 users/U1003 → users/U1001）强制重挂载，避免详情页显示旧数据 -->
            <component :is="Component" :key="viewRoute.fullPath" />
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
  justify-content: space-between;
  height: var(--app-topbar-h);
  padding: 0 20px;
  background: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-border);
  flex-shrink: 0;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ---------- 通知中心 ---------- */
.notice-btn {
  font-size: 18px;
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
}

.notice-item {
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

/* ---------- 面包屑可点击 ---------- */
.crumb-link {
  cursor: pointer;
}

.crumb-link:hover {
  color: var(--td-brand-color);
}

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

/* ---------- 多标签栏（wrap 容器固定样式，内部滚动 + 右侧全部关闭） ---------- */
.tab-bar-wrap {
  display: flex;
  align-items: center;
  height: var(--app-tabbar-h);
  background: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-border);
  flex-shrink: 0;
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  height: 100%;
  padding: 0 12px;
  overflow-x: auto;
}

.tab-bar::-webkit-scrollbar {
  height: 4px;
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
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  font-size: 12px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  white-space: nowrap;
  background: var(--td-bg-color-page);
  transition: all 120ms ease;
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
