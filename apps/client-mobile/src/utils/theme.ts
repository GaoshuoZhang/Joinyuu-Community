/** 主题模式：system 跟随系统，light/dark 为手动指定（持久化到 localStorage）。 */
export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_KEY = 'joinyuu_theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const META_LIGHT = '#f3f3f3'
const META_DARK = '#181818'

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
}

export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

/** 当前模式下的最终明暗（system 解析为系统偏好）。 */
export function isDarkTheme(mode: ThemeMode = getThemeMode()): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark())
}

/** 应用主题到 html（TDesign 的 .dark / theme-mode 变量随之生效）并同步浏览器主题色。
 * v51：切换期间冻结全站过渡——否则 5 处颜色过渡（导航栏底色、发布/合作入口卡的描边与底色）
 * 连同库内组件过渡会在同一帧一起起跑，切换出现拖影。冻类 → 应用主题 → 强制一次样式
 * 刷新 → 下一帧移除，整个过程不补间。 */
export function applyTheme(mode: ThemeMode): void {
  const dark = isDarkTheme(mode)
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.classList.toggle('dark', dark)
  root.setAttribute('theme-mode', dark ? 'dark' : 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? META_DARK : META_LIGHT)
  /* 读取布局属性强制样式刷新：确保新主题在同一帧内直接生效 */
  void root.offsetHeight
  window.requestAnimationFrame(() => root.classList.remove('theme-switching'))
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* 隐私模式忽略 */
  }
  applyTheme(mode)
}

export function themeModeLabel(mode: ThemeMode = getThemeMode()): string {
  if (mode === 'light') return '浅色'
  if (mode === 'dark') return '深色'
  return '跟随系统'
}

/** 启动时调用一次：应用已保存主题；「跟随系统」时监听系统明暗切换。 */
export function initTheme(): void {
  applyTheme(getThemeMode())
  if (typeof window.matchMedia !== 'function') return
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (getThemeMode() === 'system') applyTheme('system')
  })
}
