<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ActionSheet, Cell, CellGroup, DialogPlugin } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { getThemeMode, setThemeMode, themeModeLabel, type ThemeMode } from '@/utils/theme'

/* 设置（二级收纳页）：资料/地址/账号安全/数据看板/深色模式/退出登录。 */
const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const entries: { path: string; label: string }[] = [
  { path: '/me/profile/edit', label: '编辑资料' },
  { path: '/me/addresses', label: '收货地址' },
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
  await auth.logout()
  notices.reset()
  await router.push('/login')
}
</script>

<template>
  <div class="page-fade-in me-settings">
    <CellGroup theme="card">
      <Cell v-for="e in entries" :key="e.path" :title="e.label" arrow @click="router.push(e.path)" />
    </CellGroup>
    <CellGroup theme="card">
      <Cell title="深色模式" :note="themeLabel" arrow @click="themeSheetVisible = true" />
    </CellGroup>
    <CellGroup theme="card">
      <Cell class="logout" title="退出登录" arrow @click="onLogout" />
    </CellGroup>

    <ActionSheet
      v-model:visible="themeSheetVisible"
      theme="list"
      description="深色模式"
      cancel-text="取消"
      :items="themeItems"
      @selected="onThemeSelected"
    />
  </div>
</template>

<style scoped>
.me-settings {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.me-settings :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

.logout {
  color: var(--td-error-color);
}
</style>
