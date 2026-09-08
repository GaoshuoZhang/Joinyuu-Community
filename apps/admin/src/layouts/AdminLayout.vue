<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppIcon,
  Building1Icon,
  BuildingIcon,
  CalendarIcon,
  CartIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  CloseIcon,
  DashboardIcon,
  Edit2Icon,
  MapIcon,
  UserCircleIcon,
  UserIcon,
  UserListIcon,
  ViewListIcon,
  ViewModuleIcon,
} from 'tdesign-icons-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useTabsStore } from '@/stores/tabs'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const tabs = useTabsStore()

const collapsed = ref(false)

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
  return p
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
          theme="light"
          :default-expanded="['group-members', 'group-biz']"
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
              社区个人
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

          <t-submenu value="group-points" title="积分管理">
            <template #icon><CartIcon /></template>
            <t-menu-item value="/mall/goods">
              <template #icon><CartIcon /></template>
              商品管理
            </t-menu-item>
            <t-menu-item value="/mall/orders">
              <template #icon><ViewListIcon /></template>
              订单管理
            </t-menu-item>
            <t-menu-item value="/mall/rules">
              <template #icon><Edit2Icon /></template>
              积分规则
            </t-menu-item>
            <t-menu-item value="/mall/ledger">
              <template #icon><AppIcon /></template>
              积分账单
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

          <t-submenu value="group-facility" title="运营设施">
            <template #icon><MapIcon /></template>
            <t-menu-item value="/contents">
              <template #icon><Edit2Icon /></template>
              资讯内容
            </t-menu-item>
          </t-submenu>
        </t-menu>
      </div>

      <div class="side-footer" @click="collapsed = !collapsed">
        <ChevronLeftIcon :class="{ 'rotate-180': collapsed }" />
        <span v-if="!collapsed">收起菜单</span>
      </div>
    </aside>

    <!-- 主区 -->
    <div class="main-col">
      <header class="top-bar">
        <t-breadcrumb max-item-width="160">
          <t-breadcrumb-item>{{ (route.meta.group as string) || '聚屿社区' }}</t-breadcrumb-item>
          <t-breadcrumb-item>{{ route.meta.title as string }}</t-breadcrumb-item>
        </t-breadcrumb>
        <div class="top-right">
          <t-dropdown :options="dropdownOptions" @click="handleDropdown">
            <div class="admin-chip">
              <t-avatar size="28px">{{ auth.name.slice(0, 1) }}</t-avatar>
              <span class="admin-name">{{ auth.name || '管理员' }}</span>
            </div>
          </t-dropdown>
        </div>
      </header>

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

      <main class="page-scroll">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
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
  justify-content: center;
  gap: 6px;
  height: 40px;
  border-top: 1px solid var(--td-component-border);
  color: var(--td-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

.side-footer:hover {
  color: var(--td-brand-color);
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

/* ---------- 多标签栏 ---------- */
.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: var(--app-tabbar-h);
  padding: 0 12px;
  background: var(--td-bg-color-container);
  border-bottom: 1px solid var(--td-component-border);
  flex-shrink: 0;
  overflow-x: auto;
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
