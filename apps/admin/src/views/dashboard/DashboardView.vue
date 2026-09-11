<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AppIcon,
  Building1Icon,
  BuildingIcon,
  CalendarIcon,
  CartIcon,
  CheckCircleIcon,
  Edit2Icon,
  MapIcon,
  SettingIcon,
  TimeIcon,
  LocationIcon,
  UserCircleIcon,
  UserIcon,
  ViewListIcon,
} from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import TrendChart from '@/components/TrendChart.vue'
import { applicationTypeMap } from '@/constants/status'
import { fetchDashboard, fetchTrend, type DashboardData, type TrendPoint } from '@/api/dashboard'
import { fetchAnnouncements } from '@/api/announcements'
import { fetchUsers } from '@/api/users'
import { fetchIndividuals } from '@/api/individuals'
import { fetchEnterprises } from '@/api/enterprises'
import { fetchExternalEnterprises } from '@/api/external-enterprises'
import { fetchProjects } from '@/api/projects'
import { fetchArticles } from '@/api/contents'
import type { Announcement } from '@/types'

const router = useRouter()
const loading = ref(true)
const data = ref<DashboardData | null>(null)

/* ---------- 趋势区块：成员/需求/活动/积分，按 3/7/15/30 天区间展示（真实接口 dashboard/trend） ---------- */
const trendLoading = ref(false)
const trend = ref<TrendPoint[]>([])
const trendTab = ref('members')
const trendDays = ref(30)

const trendTabs = [
  { label: '新增成员', value: 'members', key: 'members' as const },
  { label: '新增需求', value: 'demands', key: 'demands' as const },
  { label: '新增活动', value: 'events', key: 'events' as const },
  { label: '发放积分', value: 'points', key: 'points' as const },
]

const trendDaysOptions = [
  { label: '3 天', value: 3 },
  { label: '7 天', value: 7 },
  { label: '15 天', value: 15 },
  { label: '30 天', value: 30 },
]

/* 顶部统计：选中区间（3/7/15/30 天）内的累计值，而非最后一日值——
 * 避免「当日为 0 时统计恒为 0」与图表趋势不符的误读 */
const trendTotal = computed(() =>
  trend.value.reduce(
    (sum, p) => sum + (trendTab.value === 'points' ? p.points : (p[trendTab.value] as number)),
    0,
  ),
)

/* 趋势指标展示名（「新增成员」等，用于统计文案） */
const activeTrendLabel = computed(
  () => trendTabs.find((t) => t.value === trendTab.value)?.label ?? '',
)

async function loadTrend(days: number) {
  trendLoading.value = true
  try {
    trend.value = await fetchTrend(days)
  } finally {
    trendLoading.value = false
  }
}

watch(trendDays, (d) => {
  loadTrend(d)
})

/* ---------- 系统公告（最新 3 条已发布） ---------- */
const announcements = ref<Announcement[]>([])
const announcementsLoading = ref(false)

async function loadAnnouncements() {
  announcementsLoading.value = true
  try {
    const res = await fetchAnnouncements({ page: 1, pageSize: 3, status: 'published' })
    announcements.value = res.list
  } catch {
    /* 公告加载失败静默 */
  } finally {
    announcementsLoading.value = false
  }
}

onMounted(async () => {
  try {
    data.value = await fetchDashboard()
  } finally {
    loading.value = false
  }
  loadTrend(trendDays.value)
  loadAnnouncements()
  loadPlatformStats()
})

/* ---------- 布局编辑：卡片显隐开关（下拉列表 + localStorage 持久化） ---------- */
const CARD_KEYS = ['todos', 'stats', 'announcements', 'approvals', 'events', 'trend', 'quick'] as const
type CardKey = (typeof CARD_KEYS)[number]
const CARD_TITLES: Record<CardKey, string> = {
  todos: '待办卡片',
  stats: '平台数据',
  announcements: '系统公告',
  approvals: '待办审核',
  events: '近期活动',
  trend: '运营趋势',
  quick: '快捷入口',
}
const CARDS_STORAGE_KEY = 'joinyuu_dash_cards'

const cardOn = reactive<Record<CardKey, boolean>>(loadCards())

function loadCards(): Record<CardKey, boolean> {
  const all: Record<CardKey, boolean> = Object.fromEntries(CARD_KEYS.map((k) => [k, true])) as Record<CardKey, boolean>
  const raw = localStorage.getItem(CARDS_STORAGE_KEY)
  if (!raw) return all
  try {
    const saved = JSON.parse(raw) as Partial<Record<CardKey, boolean>>
    for (const k of CARD_KEYS) if (typeof saved[k] === 'boolean') all[k] = saved[k]
  } catch {
    /* 损坏数据回默认 */
  }
  return all
}

function persistCards() {
  localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cardOn))
}

function isCardOn(key: CardKey) {
  return cardOn[key]
}

function toggleCard(key: CardKey, v: boolean) {
  cardOn[key] = v
  persistCards()
}

function resetCards() {
  for (const k of CARD_KEYS) cardOn[k] = true
  persistCards()
}

/* 布局编辑弹层（仿「列设置」面板样式）：卡片开关 + 恢复默认 */
const layoutVisible = ref(false)

/* ---------- 数据与跳转 ---------- */
/* 六域待办卡片的图标与跳转路由（数据来自 fetchDashboard().todos） */
const todoCardIcons: Record<string, unknown> = {
  settle: CheckCircleIcon,
  demand: ViewListIcon,
  reservation: MapIcon,
  showcase: BuildingIcon,
  article: Edit2Icon,
  lease: TimeIcon,
}

function goTodo(todo: { route: string }) {
  /* 文章审核待办：旧待办路径映射到投稿审核页 /contents/submissions */
  const route = todo.route === '/contents' ? '/contents/submissions' : todo.route
  router.push(route)
}

const quickEntries = [
  { label: '用户管理', path: '/users', icon: UserIcon },
  { label: '社区企业', path: '/enterprises', icon: BuildingIcon },
  { label: '申请审核', path: '/approvals', icon: CheckCircleIcon },
  { label: '需求管理', path: '/demands', icon: ViewListIcon },
  { label: '项目管理', path: '/projects', icon: AppIcon },
  { label: '活动管理', path: '/events', icon: CalendarIcon },
  { label: '商品管理', path: '/mall/goods', icon: CartIcon },
  { label: '公共空间管理', path: '/spaces', icon: MapIcon },
]

/* 平台数据：六域计数（全部用户/社区个体/社区企业/合作企业/进行中项目/资讯内容；
 * 与各列表分页 total 同口径，前端并行聚合，任一失败不阻塞卡片） */
interface PlatformStat {
  label: string
  value: number
  icon: unknown
  route: string
}

const platformStats = ref<PlatformStat[]>([])

async function loadPlatformStats() {
  const count = (p: Promise<{ total: number }>) => p.then((r) => r.total).catch(() => 0)
  const [users, individuals, enterprises, externals, projects, articles] = await Promise.all([
    count(fetchUsers({ page: 1, pageSize: 1 })),
    count(fetchIndividuals({ page: 1, pageSize: 1 })),
    count(fetchEnterprises({ page: 1, pageSize: 1 })),
    count(fetchExternalEnterprises({ page: 1, pageSize: 1 })),
    count(fetchProjects({ page: 1, pageSize: 1 })),
    count(fetchArticles({ page: 1, pageSize: 1 })),
  ])
  platformStats.value = [
    { label: '全部用户', value: users, icon: markRaw(UserIcon), route: '/users' },
    { label: '社区个体', value: individuals, icon: markRaw(UserCircleIcon), route: '/individuals' },
    { label: '社区企业', value: enterprises, icon: markRaw(BuildingIcon), route: '/enterprises' },
    { label: '合作企业', value: externals, icon: markRaw(Building1Icon), route: '/external-enterprises' },
    { label: '进行中的项目', value: projects, icon: markRaw(AppIcon), route: '/projects' },
    { label: '资讯内容', value: articles, icon: markRaw(Edit2Icon), route: '/contents/publish' },
  ]
}

/* ESC 关闭「编辑布局」弹层：t-popup 仅 trigger=focus 时内置 ESC 处理，click 触发需自行监听 */
function onLayoutKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && layoutVisible.value) layoutVisible.value = false
}
onMounted(() => window.addEventListener('keydown', onLayoutKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onLayoutKeydown))
</script>

<template>
  <div class="dashboard page-fade-in">
    <PageHeader title="工作台" description="聚屿社区运营概览与今日待办">
      <template #actions>
        <t-popup
          v-model:visible="layoutVisible"
          trigger="click"
          placement="bottom-right"
          :show-arrow="false"
          :overlay-style="{ padding: '0' }"
          :overlay-inner-style="{ background: 'transparent', boxShadow: 'none', borderRadius: '0', padding: '0' }"
        >
          <t-button variant="outline">
            <template #icon><SettingIcon /></template>
            编辑布局
          </t-button>
          <template #content>
            <div class="layout-panel">
              <div class="layout-panel-head">
                <span class="layout-panel-title">工作台布局</span>
                <t-link theme="primary" hover="color" size="small" @click="resetCards">恢复默认</t-link>
              </div>
              <div class="layout-list">
                <div v-for="k in CARD_KEYS" :key="k" class="layout-row">
                  <span class="layout-name">{{ CARD_TITLES[k] }}</span>
                  <t-switch :value="cardOn[k]" size="small" @change="(v: boolean) => toggleCard(k, v)" />
                </div>
              </div>
              <p class="layout-tip">开关控制卡片显隐，配置保存在本地浏览器。</p>
            </div>
          </template>
        </t-popup>
      </template>
    </PageHeader>

    <t-skeleton v-if="loading" :row-col="[{ width: '100%', height: '88px' }, [{ width: '48%', height: '260px' }, { width: '48%', height: '260px' }]]" animation="gradient" />

    <template v-else-if="data">
      <!-- 六域待办卡片 -->
      <section v-show="isCardOn('todos')" class="dash-block">
        <div class="stat-grid stagger">
          <StatCard
            v-for="todo in data.todos"
            :key="todo.key"
            class="stat-clickable"
            :class="{ 'is-active': todo.count > 0 }"
            :label="todo.title"
            :value="todo.count"
            :icon="todoCardIcons[todo.key]"
            @click="goTodo(todo)"
          />
        </div>
      </section>

      <!-- 平台数据 / 系统公告 -->
      <div class="panel-grid">
        <section v-show="isCardOn('stats')" class="dash-block page-card">
          <div class="panel-head">
            <h3 class="panel-title">平台数据</h3>
          </div>
          <div class="stats-grid">
            <div
              v-for="item in platformStats"
              :key="item.label"
              class="stats-cell clickable"
              @click="router.push(item.route)"
            >
              <component :is="item.icon" class="stats-icon" />
              <div class="stats-cell-main">
                <span class="stats-value">{{ item.value.toLocaleString() }}</span>
                <span class="stats-label">{{ item.label }}</span>
              </div>
            </div>
          </div>
        </section>

        <section v-show="isCardOn('announcements')" class="dash-block page-card">
          <div class="panel-head">
            <h3 class="panel-title">系统公告</h3>
            <t-link theme="primary" hover="color" @click="router.push('/contents/announcements')">全部</t-link>
          </div>
          <t-empty v-if="!announcements.length && !announcementsLoading" description="暂无公告" />
          <div v-else class="notice-list">
            <div v-for="a in announcements" :key="a.id" class="todo-item dash-item" @click="router.push('/contents/announcements')">
              <div class="todo-main">
                <t-tag v-if="a.pinned" theme="warning" variant="light" size="small">置顶</t-tag>
                <span class="todo-title">{{ a.title }}</span>
              </div>
              <div class="todo-meta">
                <span>公告 · {{ a.publishedAt }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 待办审核 / 近期活动 -->
      <div class="panel-grid">
        <section v-show="isCardOn('approvals')" class="dash-block page-card">
          <div class="panel-head">
            <h3 class="panel-title">待办审核</h3>
            <t-link theme="primary" hover="color" @click="router.push('/approvals')">全部</t-link>
          </div>
          <t-empty v-if="data.pendingApplications.length === 0" description="暂无待审核申请" />
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
        </section>

        <section v-show="isCardOn('events')" class="dash-block page-card">
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
        </section>
      </div>

      <!-- 30 日运营趋势 / 快捷入口：半屏并排 -->
      <div class="half-grid">
        <section v-show="isCardOn('trend')" class="dash-block panel-card">
          <div class="panel-head">
            <h3 class="panel-title">运营趋势</h3>
            <t-radio-group v-model="trendDays" variant="outline" size="small">
              <t-radio-button v-for="o in trendDaysOptions" :key="o.value" :value="o.value">{{ o.label }}</t-radio-button>
            </t-radio-group>
          </div>
          <t-tabs v-model="trendTab" size="medium">
            <t-tab-panel v-for="t in trendTabs" :key="t.value" :value="t.value" :label="t.label">
              <div class="trend-head">
                <div class="trend-stat">
                  <span class="trend-label">{{ activeTrendLabel }}（近 {{ trendDays }} 天）</span>
                  <strong>{{ trendTotal.toLocaleString() }}</strong>
                </div>
              </div>
              <div v-loading="trendLoading" class="trend-body">
                <TrendChart
                  v-if="trend.length"
                  :labels="trend.map((p) => p.date)"
                  :data="trend.map((p) => p[t.key])"
                  :color="t.value === 'points' ? '#00A870' : '#0052D9'"
                  :height="220"
                />
              </div>
            </t-tab-panel>
          </t-tabs>
        </section>

        <section v-show="isCardOn('quick')" class="dash-block panel-card">
          <div class="panel-head">
            <h3 class="panel-title">快捷入口</h3>
          </div>
          <div class="quick-grid">
            <div v-for="entry in quickEntries" :key="entry.path" class="quick-item" @click="router.push(entry.path)">
              <component :is="entry.icon" class="quick-icon" />
              <span>{{ entry.label }}</span>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.half-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-card {
  padding: 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-container);
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
.event-list,
.notice-list {
  display: grid;
  gap: 8px;
}

/* 统一条目高度：待办审核/近期活动/系统公告保持同一视觉 */
.todo-item,
.event-item {
  min-height: 60px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.dash-item {
  display: flex !important;
  flex-direction: column;
  justify-content: center;
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

/* ---------- 平台数据 ---------- */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.stats-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
}

.stats-cell.clickable {
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.stats-cell.clickable:hover {
  border-color: var(--td-brand-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.stats-icon {
  font-size: 24px;
  color: var(--td-brand-color);
}

.stats-cell-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stats-value {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--td-text-color-primary);
}

.stats-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* ---------- 快捷入口 ---------- */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
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

/* ---------- 编辑布局弹层（仿「列设置」面板） ---------- */
.dash-block {
  position: relative;
}

.layout-panel {
  width: 220px;
  padding: 8px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  box-shadow: var(--td-shadow-2);
}

.layout-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.layout-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.layout-list {
  max-height: 300px;
  overflow-y: auto;
}

.layout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  border-radius: var(--td-radius-small);
}

.layout-row:hover {
  background: var(--td-bg-color-container-hover);
}

.layout-name {
  font-size: 13px;
  color: var(--td-text-color-primary);
}

.layout-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

/* ---------- 趋势区块 ---------- */
.trend-head {
  display: flex;
  justify-content: flex-start;
  margin: 4px 0 8px;
}

.trend-stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.trend-stat strong {
  font-size: 18px;
  font-weight: 600;
  color: var(--td-brand-color);
}

.trend-body {
  min-height: 220px;
}

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .panel-grid,
  .half-grid {
    grid-template-columns: 1fr;
  }
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>