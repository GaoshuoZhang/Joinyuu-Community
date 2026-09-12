import { defineStore } from 'pinia'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'joinyuu_theme'

/** 主题存储：light/dark，localStorage 持久化，切换即同步 document 属性 */
export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: (localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light') as ThemeMode,
  }),
  actions: {
    apply(mode?: ThemeMode) {
      const next = mode ?? this.mode
      this.mode = next
      localStorage.setItem(STORAGE_KEY, next)
      document.documentElement.style.colorScheme = next
      if (next === 'dark') document.documentElement.setAttribute('theme-mode', 'dark')
      else document.documentElement.removeAttribute('theme-mode')
    },
    toggle(): ThemeMode {
      const next: ThemeMode = this.mode === 'dark' ? 'light' : 'dark'
      this.apply(next)
      return next
    },
    /** 应用启动时初始化（App.vue onMounted / main 入口） */
    init() {
      this.apply()
    },
  },
})
