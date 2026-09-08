<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AppIcon,
  BuildingIcon,
  CalendarIcon,
  CartIcon,
  CheckCircleIcon,
  MapIcon,
  TimeIcon,
  LocationIcon,
  UserIcon,
  ViewListIcon,
} from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import { applicationTypeMap } from '@/constants/status'
import { fetchDashboard, type DashboardData } from '@/api/dashboard'

const router = useRouter()
const loading = ref(true)
const data = ref<DashboardData | null>(null)

onMounted(async () => {
  try {
    data.value = await fetchDashboard()
  } finally {
    loading.value = false
  }
})

const quickEntries = [
  { label: '用户管理', path: '/users', icon: UserIcon },
  { label: '社区企业', path: '/enterprises', icon: BuildingIcon },
  { label: '申请审批', path: '/approvals', icon: CheckCircleIcon },
  { label: '需求管理', path: '/demands', icon: ViewListIcon },
  { label: '项目管理', path: '/projects', icon: AppIcon },
  { label: '活动管理', path: '/events', icon: CalendarIcon },
  { label: '商品管理', path: '/mall/goods', icon: CartIcon },
  { label: '公共空间管理', path: '/spaces', icon: MapIcon },
]
</script>

<template>
  <div class="dashboard page-fade-in">
    <PageHeader title="工作台" description="聚屿社区运营概览与今日待办">
      <template #actions>
        <t-button variant="outline" @click="router.push('/approvals')">
          <template #icon><CheckCircleIcon /></template>
          处理审批
        </t-button>
      </template>
    </PageHeader>

    <t-skeleton v-if="loading" :row-col="[{ width: '100%', height: '88px' }, [{ width: '48%', height: '260px' }, { width: '48%', height: '260px' }]]" animation="gradient" />

    <template v-else-if="data">
      <!-- 统计卡片 -->
      <div class="stat-grid stagger">
        <StatCard label="待审批申请" :value="data.stats.pendingApplications" :icon="CheckCircleIcon" />
        <StatCard label="社区用户" :value="data.stats.totalUsers" :icon="UserIcon" />
        <StatCard label="入驻企业" :value="data.stats.activeEnterprises" :icon="BuildingIcon" />
        <StatCard label="进行中项目" :value="data.stats.runningProjects" :icon="AppIcon" />
        <StatCard label="近期活动" :value="data.stats.upcomingEvents" :icon="CalendarIcon" />
      </div>

      <div class="panel-grid">
        <!-- 待办审批 -->
        <div class="page-card">
          <div class="panel-head">
            <h3 class="panel-title">待办审批</h3>
            <t-link theme="primary" hover="color" @click="router.push('/approvals')">全部</t-link>
          </div>
          <t-empty v-if="data.pendingApplications.length === 0" description="暂无待审批申请" />
          <div v-else class="todo-list">
            <div
              v-for="app in data.pendingApplications"
              :key="app.id"
              class="todo-item"
              @click="router.push('/approvals')"
            >
              <div class="todo-main">
                <t-tag variant="light" size="small">{{ applicationTypeMap[app.type].label }}</t-tag>
                <span class="todo-title">{{ app.targetName }}</span>
              </div>
              <div class="todo-meta">
                <span>{{ app.applicantName }} 提交于 {{ app.submittedAt }}</span>
                <StatusTag entity="application" :value="app.status" />
              </div>
            </div>
          </div>
        </div>

        <!-- 近期活动 -->
        <div class="page-card">
          <div class="panel-head">
            <h3 class="panel-title">近期活动</h3>
            <t-link theme="primary" hover="color" @click="router.push('/events')">全部</t-link>
          </div>
          <t-empty v-if="data.upcomingEvents.length === 0" description="暂无近期活动" />
          <div v-else class="event-list">
            <div
              v-for="event in data.upcomingEvents"
              :key="event.id"
              class="event-item"
              @click="router.push(`/events/${event.id}`)"
            >
              <div class="event-main">
                <span class="event-title">{{ event.title }}</span>
                <t-tag variant="outline" size="small">{{ event.type }}</t-tag>
              </div>
              <div class="event-meta">
                <span><TimeIcon /> {{ event.startTime }}</span>
                <span><LocationIcon /> {{ event.location }}</span>
                <span>已报名 {{ event.enrollments.filter((e) => e.status === 'approved').length }}/{{ event.capacity }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="page-card">
        <div class="panel-head">
          <h3 class="panel-title">快捷入口</h3>
        </div>
        <div class="quick-grid">
          <div v-for="entry in quickEntries" :key="entry.path" class="quick-item" @click="router.push(entry.path)">
            <component :is="entry.icon" class="quick-icon" />
            <span>{{ entry.label }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.todo-list,
.event-list {
  display: grid;
  gap: 8px;
}

.todo-item,
.event-item {
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.todo-item:hover,
.event-item:hover {
  border-color: var(--td-brand-color);
  background: var(--td-bg-color-container-hover);
}

.todo-main,
.event-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.todo-title,
.event-title {
  flex: 1;
  font-size: 14px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-meta,
.event-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.event-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 12px;
}

.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  font-size: 13px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}

.quick-item:hover {
  color: var(--td-brand-color);
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.quick-icon {
  font-size: 22px;
}

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .quick-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 768px) {
  .panel-grid {
    grid-template-columns: 1fr;
  }
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
