<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  AppIcon,
  Building1Icon,
  BuildingIcon,
  CalendarIcon,
  CartIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
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
import ListErrorState from '@/components/ListErrorState.vue'
import StatCard from '@/components/StatCard.vue'
import StatusTag from '@/components/StatusTag.vue'
import TrendChart from '@/components/TrendChart.vue'
import { applicationTypeMap } from '@/constants/status'
import { useAuthStore } from '@/stores/auth'
import { fetchDashboard, fetchTrend, type DashboardData, type TrendPoint } from '@/api/dashboard'
import { fetchAnnouncements } from '@/api/announcements'
import type { Announcement } from '@/types'
import { fetchUsers } from '@/api/users'
import { fetchIndividuals } from '@/api/individuals'
import { fetchEnterprises } from '@/api/enterprises'
import { fetchExternalEnterprises } from '@/api/external-enterprises'
import { fetchProjects } from '@/api/projects'
import { fetchArticles } from '@/api/contents'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(true)
const loadError = ref('')
const data = ref<DashboardData | null>(null)

/* 权限收敛（D-011）：待办/平台数据/快捷入口仅展示当前账号可用项 */
const TODO_PERMS: Record<string, string> = {
  settle: '/approvals',
  demand: '/demands/review',
  reservation: '/spaces/reservations',
  article: '/contents/submissions',
  eventEnrollment: '/events',
  lease: '/workstations/leases',
}
const visibleTodos = computed(() => (data.value?.todos ?? []).filter((todo) => auth.hasPerm(TODO_PERMS[todo.key] ?? '')))

/* ---------- 趋势区块：成员/需求/活动/积分，按 3/7/15/30 天区间展示（真实接口 dashboard/trend） ---------- */
const trendLoading = ref(false)
const trend = ref<TrendPoint[]>([])
const trendError = ref('')
const trendTab = ref<'members' | 'demands' | 'events' | 'points'>('members')
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

/* 请求序号守卫 + 失败提示：快速切换区间时只保留最后一次结果 */
let trendVersion = 0
async function loadTrend(days: number) {
  const current = ++trendVersion
  trendLoading.value = true
  trend.value = []
  trendError.value = ''
  try {
    const points = await fetchTrend(days)
    if (current === trendVersion) {
      trend.value = points
      trendError.value = ''
    }
  } catch (error) {
    if (current === trendVersion) {
      /* 保留错误态而非仅 toast：否则失败后 trend 为空会被渲染成「暂无趋势数据」 */
      trendError.value = error instanceof Error ? error.message : '趋势数据加载失败'
    }
  } finally {
    if (current === trendVersion) trendLoading.value = false
  }
}

watch(trendDays, (d) => {
  loadTrend(d)
})

/* ---------- 系统公告（与内容管理的首页公告列表同源：取前 3 条已发布公告，启用优先） ---------- */
const announcements = ref<Announcement[]>([])
const announcementsLoading = ref(false)
const announcementsError = ref('')

async function loadAnnouncements() {
  /* 无权限时不发请求：卡片本身已按权限隐藏，避免 403 噪音与无用往返 */
  if (!auth.hasPerm('/contents/announcements')) return
  announcementsLoading.value = true
  try {
    /* 取前 3 条已发布公告（服务端已按「启用优先 + 发布时间倒序」排序），启用的那条排最前 */
    const res = await fetchAnnouncements({ page: 1, pageSize: 3, status: 'published' })
    announcements.value = res.list
    announcementsError.value = ''
  } catch (error) {
    /* 失败需与「无公告」区分，否则会把接口异常显示成「暂无公告」 */
    announcementsError.value = error instanceof Error ? error.message : '公告加载失败'
  } finally {
    announcementsLoading.value = false
  }
}

async function load() {
  loadError.value = ''
  loading.value = true
  try {
    data.value = await fetchDashboard()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '数据加载失败'
  } finally {
    loading.value = false
  }
  loadTrend(trendDays.value)
  loadAnnouncements()
  loadPlatformStats()
}

onMounted(load)

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
const cardOrder = ref<CardKey[]>(loadCardOrder())

interface SavedCards {
  visible?: Partial<Record<CardKey, boolean>>
  order?: CardKey[]
}

function readSavedCards(): SavedCards | Partial<Record<CardKey, boolean>> | null {
  const raw = localStorage.getItem(CARDS_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SavedCards | Partial<Record<CardKey, boolean>>
  } catch {
    return null
  }
}

function loadCards(): Record<CardKey, boolean> {
  const all: Record<CardKey, boolean> = Object.fromEntries(CARD_KEYS.map((k) => [k, true])) as Record<CardKey, boolean>
  const stored = readSavedCards()
  if (!stored) return all
  const saved = 'visible' in stored && stored.visible ? stored.visible : stored as Partial<Record<CardKey, boolean>>
  for (const k of CARD_KEYS) if (typeof saved[k] === 'boolean') all[k] = saved[k]
  return all
}

function loadCardOrder(): CardKey[] {
  const stored = readSavedCards()
  const saved = stored && 'order' in stored && Array.isArray(stored.order) ? stored.order : []
  const valid = saved.filter((key): key is CardKey => CARD_KEYS.includes(key as CardKey))
  return [...new Set([...valid, ...CARD_KEYS])]
}

function persistCards() {
  localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify({ visible: cardOn, order: cardOrder.value }))
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
  cardOrder.value = [...CARD_KEYS]
  persistCards()
}

function moveCard(key: CardKey, direction: -1 | 1) {
  const index = cardOrder.value.indexOf(key)
  const target = index + direction
  if (index < 0 || target < 0 || target >= cardOrder.value.length) return
  const next = [...cardOrder.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  cardOrder.value = next
  persistCards()
}

function cardStyle(key: CardKey) {
  return { order: cardOrder.value.indexOf(key) }
}

/* 布局编辑弹层（仿「列设置」面板样式）：卡片开关 + 恢复默认 */
const layoutVisible = ref(false)

/* ---------- 数据与跳转 ---------- */
/* 待办卡片的图标与跳转路由（数据来自 fetchDashboard().todos） */
const todoCardIcons: Record<string, Component> = {
  settle: CheckCircleIcon,
  demand: ViewListIcon,
  reservation: MapIcon,
  article: Edit2Icon,
  eventEnrollment: CalendarIcon,
  lease: TimeIcon,
}


const quickEntries = computed(() =>
  [
    { label: '用户管理', path: '/users', icon: UserIcon, perm: '/users' },
    { label: '社区企业', path: '/enterprises', icon: BuildingIcon, perm: '/enterprises' },
    { label: '申请审核', path: '/approvals', icon: CheckCircleIcon, perm: '/approvals' },
    { label: '需求管理', path: '/demands', icon: ViewListIcon, perm: '/demands' },
    { label: '项目管理', path: '/projects', icon: AppIcon, perm: '/projects' },
    { label: '活动管理', path: '/events', icon: CalendarIcon, perm: '/events' },
    { label: '活动报名', path: '/events/enrollments', icon: TimeIcon, perm: '/events' },
    { label: '商品管理', path: '/mall/goods', icon: CartIcon, perm: '/mall/goods' },
    { label: '公共空间管理', path: '/spaces', icon: MapIcon, perm: '/spaces' },
  ].filter((entry) => auth.hasPerm(entry.perm)),
)

/* 平台数据：六域计数（全部用户/社区个体/社区企业/合作企业/进行中项目/资讯内容；
 * 与各列表分页 total 同口径，前端并行聚合；任一失败显示 “—” 而非 0，避免误读为“没有数据”，点击可重试） */
interface PlatformStat {
  label: string
  value: number | null
  icon: unknown
  route: string
  perm: string
}

const platformStats = ref<PlatformStat[]>([])
const statsLoading = ref(false)
const statsFailed = computed(() => platformStats.value.some((s) => s.value == null))

async function loadPlatformStats() {
  if (statsLoading.value) return
  statsLoading.value = true
  const count = (p: Promise<{ total: number }>) => p.then((r) => r.total).catch(() => null)
  /* 先按权限收敛再请求：无权限账号不打必然 403 的接口 */
  const defs: { label: string; icon: unknown; route: string; perm: string; fetch: () => Promise<{ total: number }> }[] = [
    { label: '全部用户', icon: markRaw(UserIcon), route: '/users', perm: '/users', fetch: () => fetchUsers({ page: 1, pageSize: 1 }) },
    { label: '社区个体', icon: markRaw(UserCircleIcon), route: '/individuals', perm: '/individuals', fetch: () => fetchIndividuals({ page: 1, pageSize: 1 }) },
    { label: '社区企业', icon: markRaw(BuildingIcon), route: '/enterprises', perm: '/enterprises', fetch: () => fetchEnterprises({ page: 1, pageSize: 1 }) },
    { label: '合作企业', icon: markRaw(Building1Icon), route: '/external-enterprises', perm: '/external-enterprises', fetch: () => fetchExternalEnterprises({ page: 1, pageSize: 1 }) },
    { label: '进行中的项目', icon: markRaw(AppIcon), route: '/projects', perm: '/projects', fetch: () => fetchProjects({ page: 1, pageSize: 1 }) },
    { label: '资讯内容', icon: markRaw(Edit2Icon), route: '/contents/publish', perm: '/contents/publish', fetch: () => fetchArticles({ page: 1, pageSize: 1 }) },
  ].filter((d) => auth.hasPerm(d.perm))
  const totals = await Promise.all(defs.map((d) => count(d.fetch())))
  platformStats.value = defs.map((d, i) => ({ label: d.label, value: totals[i], icon: d.icon as PlatformStat['icon'], route: d.route, perm: d.perm }))
  statsLoading.value = false
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
          overlay-class-name="layout-popup"
          overlay-inner-class-name="layout-popup-inner"
        >
          <t-button variant="outline">
            <template #icon><SettingIcon /></template>
            编辑布局
          </t-button>
          <template #content>
            <div class="layout-panel">
              <div class="layout-panel-head">
                <span class="layout-panel-title">工作台布局</span>
                <t-button theme="primary" variant="text" size="small" @click="resetCards">恢复默认</t-button>
              </div>
              <div class="layout-list">
                <div v-for="k in cardOrder" :key="k" class="layout-row">
                  <span class="layout-name">{{ CARD_TITLES[k] }}</span>
                  <div class="layout-controls">
                    <ChevronUpIcon class="layout-move" role="button" tabindex="0" :aria-label="`上移${CARD_TITLES[k]}`" @click="moveCard(k, -1)" @keydown.enter.space.prevent="moveCard(k, -1)" />
                    <ChevronDownIcon class="layout-move" role="button" tabindex="0" :aria-label="`下移${CARD_TITLES[k]}`" @click="moveCard(k, 1)" @keydown.enter.space.prevent="moveCard(k, 1)" />
                    <t-switch v-accessible-field="`${CARD_TITLES[k]}显隐开关`" :value="cardOn[k]" size="small" :aria-label="`${CARD_TITLES[k]}显隐开关`" @change="(v: boolean) => toggleCard(k, v)" />
                  </div>
                </div>
              </div>
              <p class="layout-tip">开关控制显隐，↑↓ 调整顺序；配置保存在本地浏览器。</p>
            </div>
          </template>
        </t-popup>
      </template>
    </PageHeader>

    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <t-skeleton v-if="loading" :row-col="[{ width: '100%', height: '88px' }, [{ width: '48%', height: '260px' }, { width: '48%', height: '260px' }]]" animation="gradient" />

    <template v-else-if="data">
      <div class="dashboard-grid">
      <!-- 六域待办卡片 -->
      <section v-show="isCardOn('todos')" class="dash-block todos-block" :style="cardStyle('todos')">
        <div class="stat-grid stagger">
          <StatCard
            v-for="todo in visibleTodos"
            :key="todo.key"
            class="stat-clickable"
            :class="{ 'is-active': todo.count > 0 }"
            :label="todo.title"
            :value="todo.count"
            :icon="todoCardIcons[todo.key]"
            :href="router.resolve(todo.route === '/contents' ? '/contents/submissions' : todo.route).href"
          />
        </div>
      </section>

      <!-- 平台数据 / 系统公告 -->
      <div class="panel-grid">
        <section v-show="isCardOn('stats') && platformStats.length" class="dash-block page-card" :style="cardStyle('stats')">
          <div class="panel-head">
            <h3 class="panel-title">平台数据</h3>
            <t-button v-if="statsFailed" variant="text" size="small" :loading="statsLoading" @click="loadPlatformStats">
              重试
            </t-button>
          </div>
          <div class="stats-grid">
            <template v-for="item in platformStats" :key="item.label">
              <!-- 加载失败：显示 “—” 而非 0，点击重试 -->
              <div
                v-if="item.value == null"
                class="stats-cell is-failed"
                role="button"
                tabindex="0"
                title="数据加载失败，点击重试"
                @click="loadPlatformStats"
                @keydown.enter.prevent="loadPlatformStats"
                @keydown.space.prevent="loadPlatformStats"
              >
                <component :is="item.icon" class="stats-icon" />
                <div class="stats-cell-main">
                  <span class="stats-value">{{ statsLoading ? '…' : '—' }}</span>
                  <span class="stats-label">{{ item.label }}</span>
                </div>
              </div>
              <t-link
                v-else
                class="stats-cell clickable"
                :href="`#${item.route}`"
                theme="default"
                hover="color"
              >
                <component :is="item.icon" class="stats-icon" />
                <div class="stats-cell-main">
                  <span class="stats-value">{{ item.value.toLocaleString('zh-CN') }}</span>
                  <span class="stats-label">{{ item.label }}</span>
                </div>
              </t-link>
            </template>
          </div>
        </section>

        <section v-show="isCardOn('announcements') && auth.hasPerm('/contents/announcements')" class="dash-block page-card" :style="cardStyle('announcements')">
          <div class="panel-head">
            <h3 class="panel-title">系统公告</h3>
            <t-link href="#/contents/announcements" theme="primary" hover="color">全部</t-link>
          </div>
          <ListErrorState v-if="announcementsError" :message="announcementsError" :loading="announcementsLoading" @retry="loadAnnouncements" />
          <t-empty v-else-if="!announcements.length && !announcementsLoading" description="暂无公告" />
          <div v-else class="notice-list">
            <t-link theme="default" hover="color" v-for="a in announcements" :key="a.id" class="todo-item dash-item" :href="router.resolve({ path: '/contents/announcements', query: { record: a.id } }).href">
              <div class="todo-main">
                <!-- 置顶仅一种状态：未置顶不渲染标签，不再借用 enabledFlag 状态语义 -->
                <t-tag v-if="a.pinned" theme="warning" variant="light" size="small">置顶</t-tag>
                <span class="todo-title" :title="a.title">{{ a.title }}</span>
              </div>
              <div class="todo-meta">
                <span>{{ a.publishedAt }}</span>
              </div>
            </t-link>
          </div>
        </section>
      </div>

      <!-- 待办审核 / 近期活动 -->
      <div class="panel-grid">
        <section v-show="isCardOn('approvals') && auth.hasPerm('/approvals')" class="dash-block page-card" :style="cardStyle('approvals')">
          <div class="panel-head">
            <h3 class="panel-title">待办审核</h3>
            <t-link href="#/approvals" theme="primary" hover="color">全部</t-link>
          </div>
          <t-empty v-if="data.pendingApplications.length === 0" description="暂无待审核申请" />
          <div v-else class="todo-list">
            <t-link theme="default" hover="color"
              v-for="app in data.pendingApplications"
              :key="app.id"
              class="todo-item"
              :href="router.resolve({ path: '/approvals', query: { record: app.id } }).href"
            >
              <div class="todo-main">
                <t-tag variant="light" size="small">{{ applicationTypeMap[app.type].label }}</t-tag>
                <span class="todo-title" :title="app.targetName">{{ app.targetName }}</span>
              </div>
              <div class="todo-meta">
                <span>{{ app.applicantName }} 提交于 {{ app.submittedAt }}</span>
                <StatusTag entity="application" :value="app.status" />
              </div>
            </t-link>
          </div>
        </section>

        <section v-show="isCardOn('events') && auth.hasPerm('/events')" class="dash-block page-card" :style="cardStyle('events')">
          <div class="panel-head">
            <h3 class="panel-title">近期活动</h3>
            <t-link href="#/events" theme="primary" hover="color">全部</t-link>
          </div>
          <t-empty v-if="data.upcomingEvents.length === 0" description="暂无近期活动" />
          <div v-else class="event-list">
            <t-link theme="default" hover="color"
              v-for="event in data.upcomingEvents"
              :key="event.id"
              class="event-item"
              :href="`#/events/${event.id}`"
            >
              <div class="event-main">
                <span class="event-title" :title="event.title">{{ event.title }}</span>
                <t-tag variant="light" size="small">{{ event.type }}</t-tag>
              </div>
              <div class="event-meta">
                <span><TimeIcon /> {{ event.startTime }}</span>
                <span><LocationIcon /> {{ event.location }}</span>
                <span class="enroll-count">已报名 {{ event.enrollments.filter((e) => e.status === 'approved').length }}/{{ event.capacity }}</span>
              </div>
            </t-link>
          </div>
        </section>
      </div>

      <!-- 30 日运营趋势 / 快捷入口：半屏并排 -->
      <div class="half-grid">
        <section v-show="isCardOn('trend')" class="dash-block page-card" :style="cardStyle('trend')">
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
                  <strong>{{ trendLoading || trendError ? '—' : trendTotal.toLocaleString('zh-CN') }}</strong>
                </div>
              </div>
              <t-loading :loading="trendLoading" size="small" class="trend-body">
                <TrendChart
                  v-if="trend.length"
                  :labels="trend.map((p) => p.date)"
                  :data="trend.map((p) => p[t.key])"
                  :color="t.value === 'points' ? 'var(--td-success-color)' : 'var(--td-brand-color)'"
                  :height="220"
                />
                <ListErrorState v-else-if="trendError" :message="trendError" :loading="trendLoading" @retry="loadTrend(trendDays)" />
                <t-empty v-else-if="!trendLoading" description="暂无趋势数据" />
              </t-loading>
            </t-tab-panel>
          </t-tabs>
        </section>

        <section v-show="isCardOn('quick')" class="dash-block page-card" :style="cardStyle('quick')">
          <div class="panel-head">
            <h3 class="panel-title">快捷入口</h3>
          </div>
          <div class="quick-grid">
            <t-link theme="default" hover="color" v-for="entry in quickEntries" :key="entry.path" class="quick-item" :href="`#${entry.path}`">
              <component :is="entry.icon" class="quick-icon" />
              <span>{{ entry.label }}</span>
            </t-link>
          </div>
        </section>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

/* 子网格 display:contents 不生成盒子，纵向间距统一交给 .dashboard-grid 的 gap */
.dashboard-grid > .panel-grid,
.dashboard-grid > .half-grid {
  display: contents;
}

.todos-block {
  grid-column: 1 / -1;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 0;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.half-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.panel-title {
  margin: 0;
  font-size: var(--td-font-size-body-large);
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
  display: block;
  white-space: normal;
  text-align: left;
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
  align-items: flex-start;
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

/* 已报名 x/y 等宽数字，避免数值变化时抖动 */
.enroll-count {
  font-variant-numeric: tabular-nums;
}

/* ---------- 平台数据 ---------- */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stats-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
}

/* 加载失败的统计卡：可点击重试 */
.stats-cell.is-failed {
  cursor: pointer;
  color: var(--td-text-color-placeholder);
}

.stats-cell.is-failed:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
}

.stats-cell.clickable {
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.stats-cell.clickable:hover {
  border-color: var(--td-brand-color);
  box-shadow: var(--td-shadow-1);
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
  font-size: 20px;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  font-size: 14px;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  transition: color 120ms ease, background-color 120ms ease;
}

.quick-item:hover {
  color: var(--td-brand-color);
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.quick-icon {
  font-size: 20px;
}

/* ---------- 编辑布局弹层（仿「列设置」面板） ---------- */
.dash-block {
  position: relative;
}

/* 浮层挂载到 body，scoped 选择器无法命中，故用 :global 收窄到本页唯一类名 */
:global(.layout-popup) {
  padding: 0;
}

:global(.layout-popup-inner) {
  padding: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
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
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.layout-list {
  max-height: 300px;
  overflow-y: auto;
  /* 滚动到边界不冒泡给底层页面，避免误触发整页滚动 */
  overscroll-behavior: contain;
}

.layout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  border-radius: var(--td-radius-small);
}

.layout-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.layout-move {
  padding: 3px;
  border-radius: var(--td-radius-small);
  color: var(--td-text-color-secondary);
  cursor: pointer;
}

.layout-move:hover {
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

/* 键盘焦点环：用与 .stat-clickable 同口径的 2px 品牌色环，替代被抹掉的平台焦点指示 */
.layout-move:focus-visible {
  color: var(--td-brand-color);
  background: var(--td-brand-color-1);
  box-shadow: 0 0 0 2px var(--td-brand-color-focus);
}

.layout-name {
  font-size: 12px;
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
  gap: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.trend-stat strong {
  font-size: 20px;
  font-weight: 600;
  color: var(--td-brand-color);
  /* 复用全局等宽数字约定：切换 3/7/15/30 天区间时数值宽度不跳动 */
  font-variant-numeric: tabular-nums;
}

.trend-body {
  min-height: 220px;
}

@media (max-width: 1199px) {
  .stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .dashboard-grid,
  .panel-grid,
  .half-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
