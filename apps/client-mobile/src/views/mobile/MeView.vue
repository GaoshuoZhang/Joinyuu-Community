<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ActionSheet, Avatar, Button, Cell, CellGroup, DialogPlugin, Icon, PullDownRefresh } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useNoticesStore } from '@/stores/notices'
import { fetchExperience } from '@/api/experience'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { formatZhNumber } from '@/utils/format'
import { buildProfileMenuLayout, type ProfileMenuEntry, type ProfileStat } from '@/utils/profileMenu'
import { getThemeMode, setThemeMode, themeModeLabel, type ThemeMode } from '@/utils/theme'
import { REFRESH_LOADING_PROPS } from '@/constants/refresh'

useAnimSuppress()

/* 个人中心：按身份、服务、权益归类；详细业务记录由二级页收纳，设置菜单收在页尾。
 * 身份不做全局切换，发布/提交时在表单内选择归属。 */
const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const notices = useNoticesStore()

const levelName = ref('')
/* 等级请求失败与「未绑定」是两回事：失败时给出可重试的说明，而不是静默显示「未绑定」 */
const levelFailed = ref(false)

/* 头像加载失败兜底：与 AvatarUploader 同口径——TDesign Avatar 的 hideOnLoadFailed 会连
 * 加载成功态一起跳过图片渲染，故用 onError 记下失败地址，回退渲染默认插槽的首字 */
const failedAvatar = ref('')
const avatarImage = computed(() => (auth.avatar && auth.avatar !== failedAvatar.value ? auth.avatar : ''))
function onAvatarError() {
  failedAvatar.value = auth.avatar
}

const menu = computed(() =>
  buildProfileMenuLayout({
    hasCommunityIndividual: auth.hasCommunityIndividual,
    points: auth.points,
    levelLabel: levelName.value,
    levelFailed: levelFailed.value,
    /* 空间预约入口随运营开关隐藏（工位租约无开关，常显） */
    reservationOpen: config.config.reservationOpen,
  }),
)

function onStatTap(stat: ProfileStat) {
  if (stat.key === 'level' && stat.failed) {
    void loadLevel()
    return
  }
  void router.push(stat.path)
}

function onMenuTap(entry: ProfileMenuEntry) {
  if (entry.action === 'retry-level') {
    void loadLevel()
    return
  }
  void router.push(entry.path)
}

/* 宫格图标配色：沿用首页快捷卡片的 entryCards 色系（底色=浅色底板、图标=同族深/亮色）；
 * 主题未提供该入口色时回退页面默认强调色底板 + 反色图标（公版与旧主题观感不变）。 */
function entryIconStyle(entry: ProfileMenuEntry) {
  if (!entry.themeKey) return {}
  const key = entry.themeKey
  return {
    background: `var(--app-entry-${key}-iconBackground, var(--app-theme-accent, var(--td-brand-color)))`,
    color: `var(--app-entry-${key}-icon, var(--td-text-color-anti))`,
  }
}

async function loadLevel() {
  levelFailed.value = false
  if (!auth.isLogged || !auth.hasCommunityIndividual) {
    levelName.value = ''
    return
  }
  try {
    const ex = await fetchExperience()
    levelName.value = `Lv.${ex.level} ${ex.levelName}`
  } catch {
    /* 失败态：清空等级并在入口上提示重试（与「未绑定」区分） */
    levelName.value = ''
    levelFailed.value = true
  }
}

/* 下拉刷新：同步资料与等级/未读 */
const refreshing = ref(false)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
async function onRefresh() {
  refreshing.value = true
  try {
    await auth.refreshProfile()
    await loadLevel()
    if (auth.isLogged) await notices.refreshUnread()
  } finally {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshing.value = false
      refreshTimer = null
    }, 300)
  }
}

onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
})

async function refreshMe() {
  await auth.refreshProfile()
  await Promise.all([loadLevel(), notices.refreshUnread()])
}

onMounted(() => void refreshMe())
useRefreshOnActivate(() => void refreshMe())

/* 设置（原「设置」二级页菜单迁到页尾）：账号与安全 / 通知设置 / 数据看板 + 深色模式 + 退出登录。
 * 「编辑资料」不在此列——顶部资料卡点击即进入资料编辑。 */
const settingsEntries: { path: string; label: string }[] = [
  { path: '/me/security', label: '账号与安全' },
  { path: '/me/notification-settings', label: '通知设置' },
  { path: '/me/stats', label: '数据看板' },
]

/* 深色模式：跟随系统 / 浅色 / 深色（持久化，theme.ts 负责落到 html） */
const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: '跟随系统' },
  { mode: 'light', label: '浅色' },
  { mode: 'dark', label: '深色' },
]
const themeMode = ref<ThemeMode>(getThemeMode())
const themeSheetVisible = ref(false)
const themeLabel = computed(() => themeModeLabel(themeMode.value))
const themeItems = computed(() =>
  THEME_OPTIONS.map((option) => ({
    label: option.mode === themeMode.value ? `${option.label}（当前）` : option.label,
  })),
)

function onThemeSelected(_item: unknown, index: number) {
  const option = THEME_OPTIONS[index]
  themeSheetVisible.value = false
  if (!option) return
  setThemeMode(option.mode)
  themeMode.value = option.mode
}

function onLogout() {
  DialogPlugin.confirm({
    title: '退出登录',
    content: '确认退出当前账号？未保存的编辑内容将丢失。',
    cancelBtn: '取消',
    confirmBtn: '确认退出',
    onConfirm: () => {
      void doLogout()
    },
  })
}

async function doLogout() {
  try {
    await auth.logout()
  } catch {
    /* 登出接口失败也要清理本地会话，避免停留在半登录态 */
    auth.resetSession()
  } finally {
    await router.push('/login')
  }
}
</script>

<template>
  <PullDownRefresh class="me-refresh" :value="refreshing" :loading-props="REFRESH_LOADING_PROPS" @refresh="onRefresh">
    <div class="page-fade-in me">
      <!-- button 内容模型仅允许 phrasing content，卡内含 p/div 会破坏 AT 解析；
           改用 div + v-pressable（补 role=button/tabindex/键盘激活） -->
      <div
        class="m-card profile profile-button pressable"
        v-pressable
        aria-label="编辑个人资料"
        @click="router.push('/me/profile/edit')"
      >
        <Avatar size="56px" class="avatar" :image="avatarImage" :on-error="onAvatarError">{{ auth.name.slice(0, 1) }}</Avatar>
        <div class="info">
          <div class="name-row">
            <p class="name">{{ auth.name }}</p>
            <p v-if="auth.username" class="handle">@{{ auth.username }}</p>
          </div>
          <p class="uid">UID {{ auth.uid }}</p>
          <div class="tags">
            <IdentityTag v-for="i in auth.profileIdentities" :key="i.type" :type="i.type" />
          </div>
        </div>
      </div>

      <!-- 账户数据卡：积分 / 等级两列大数字（参考支付宝「我的」页顶部资产区） -->
      <section class="m-card stats-card" aria-label="账户概览">
        <div
          v-for="stat in menu.stats"
          :key="stat.key"
          class="stat-item"
          v-pressable
          :aria-label="`${stat.label}，${stat.failed ? '加载失败，点击重试' : stat.value}`"
          @click="onStatTap(stat)"
        >
          <p class="stat-value tabular-nums">
            <template v-if="stat.failed">—</template>
            <template v-else-if="stat.key === 'points'">{{ formatZhNumber(auth.points) }}</template>
            <template v-else>{{ stat.value }}</template>
          </p>
          <p class="stat-label">{{ stat.label }}<Icon aria-hidden="true" name="chevron-right" size="12px" /></p>
        </div>
      </section>

      <!-- 服务分区：次标题 + 4 列宫格直达二级页（分区口径见 utils/profileMenu） -->
      <div v-for="(section, index) in menu.sections" :key="section.title ?? `zone-${index}`" class="zone">
        <h2 v-if="section.title" class="zone-title">{{ section.title }}</h2>
        <section class="m-card grid-card" :aria-label="section.title ?? section.ariaLabel">
          <div
            v-for="entry in section.entries"
            :key="entry.path"
            class="grid-item"
            v-pressable
            :aria-label="entry.label"
            @click="onMenuTap(entry)"
          >
            <span class="grid-icon" :style="entryIconStyle(entry)"><Icon aria-hidden="true" :name="entry.icon" size="24px" /></span>
            <p class="grid-label">{{ entry.label }}</p>
          </div>
        </section>
      </div>

      <!-- 设置：原「设置」二级页菜单迁到页尾（编辑资料由顶部资料卡承载，不单列） -->
      <div class="settings">
        <CellGroup theme="card">
          <router-link v-for="e in settingsEntries" :key="e.path" class="cell-link" :to="e.path" :aria-label="e.label">
            <Cell :title="e.label" arrow />
          </router-link>
        </CellGroup>
        <CellGroup theme="card">
          <Button class="cell-action" variant="text" block :aria-label="`深色模式，当前${themeLabel}`" @click="themeSheetVisible = true"><Cell title="深色模式" :note="themeLabel" arrow /></Button>
        </CellGroup>
        <CellGroup theme="card">
          <Button class="cell-action" variant="text" block @click="onLogout"><Cell class="logout" title="退出登录" :bordered="false" /></Button>
        </CellGroup>
      </div>
    </div>

    <!-- TDesign 该版本 ActionSheet 只发 update:modelValue（cancel/close 事件不触发），
         因此必须用 v-model 而非 v-model:visible；取消与点遮罩关闭都走该事件 -->
    <ActionSheet
      v-model="themeSheetVisible"
      theme="list"
      description="深色模式"
      cancel-text="取消"
      :items="themeItems"
      @selected="onThemeSelected"
    />
  </PullDownRefresh>
</template>

<style scoped>
.me {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

/* 整页下拉刷新：组件根默认 height:100% + overflow:hidden 会把最后一个选项裁在容器边界上，
 * 改为内容驱动高度并允许溢出，保证整页可下拉且底部完整可见 */
.me-refresh {
  height: auto;
  min-height: 100%;
  overflow: visible;
}

.me-refresh :deep(.t-pull-down-refresh__track) {
  height: auto;
}

.profile {
  display: flex;
  align-items: center;
  gap: var(--app-space-6);
}

.profile-button {
  width: 100%;
  color: inherit; /* typography-token-exempt: 下一行 font: inherit 是 div 容器上 button 时期遗留的字体 reset（div 默认即继承字体），无角色档可表达；升级复核点：容器改回 button 元素时需重新评估该 reset */
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 账户数据卡：两列大数字 + 标签（点击进积分/等级页；等级失败态点击重试） */
.stats-card {
  display: flex;
  align-items: stretch;
  padding: var(--app-space-7) var(--app-space-5);
  gap: var(--app-space-4);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-2) 0;
  cursor: pointer;
}

.stat-item + .stat-item {
  border-left: 1px solid var(--td-component-border);
}

.stat-value {
  margin: 0;
  font: var(--app-type-numeric-lg);
  color: var(--td-text-color-brand);
}

.stat-label {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* 服务分区：次标题与其宫格成组（标题贴近本区卡片，分区间距由 .me 的 gap 统一控制） */
.zone {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.zone-title {
  margin: 0;
  padding: 0 var(--app-space-1);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

/* 服务宫格：4 列图标直达（参考支付宝「我的」页功能宫格） */
.grid-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--app-space-2) 0;
  padding: var(--app-space-6) var(--app-space-3);
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-2);
  min-height: 76px;
  padding: var(--app-space-2) 0;
  cursor: pointer;
}

/* 宫格图标底板：底色与图标色由 entryIconStyle 内联注入（沿用首页快捷卡片色系）；
 * 此处的强调色底板 + 反色图标是主题未定义入口色时的兜底。 */
.grid-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--td-radius-large);
  background: var(--app-theme-accent, var(--td-brand-color));
  color: var(--td-text-color-anti);
}

.grid-item:active .grid-icon {
  filter: brightness(0.92);
}

.grid-label {
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-brand);
}

.avatar {
  font: var(--app-type-display);
}

.info {
  flex: 1;
  min-width: 0;
}

/* 昵称与 @用户名 并排展示；字重/字号各自沿用 .name / .handle 原口径 */
.name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--app-space-2);
  margin: 0 0 var(--app-space-2);
}

.name {
  margin: 0;
  font: var(--app-type-page-title);
}

.uid {
  margin: 0 0 var(--app-space-3);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.handle {
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-3);
}

/* 页尾设置菜单（自原「设置」二级页迁入）：三组卡片，组间距沿用 .me 的 gap */
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

/* CellGroup 自带左右 16px 外边距，与页面 padding 叠加会导致卡片偏窄 */
.settings :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

/* v45：Cell 标题颜色由 --td-cell-title-color 决定，直接写 color 不会覆盖。
 * 破坏性操作用错误色 + 去掉右侧箭头（它不跳转，只弹确认），与上方跳转行区分开。 */
.logout {
  --td-cell-title-color: var(--td-error-color);
  color: var(--td-error-color);
}

.cell-action :deep(.t-button__content) { display: block; width: 100%; }
.cell-link { display: block; color: inherit; text-decoration: none; }
.cell-action { display: block; width: 100%; height: auto; min-height: 48px; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.cell-link:focus-visible, .cell-action:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: -2px; }
</style>
