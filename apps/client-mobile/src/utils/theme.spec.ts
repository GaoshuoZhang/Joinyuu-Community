import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getThemeMode, initTheme, isDarkTheme, setThemeMode, themeModeLabel } from './theme'

/* 模拟可变的系统偏好：theme.ts 每次调用会新建 matchMedia 实例，用共享 state 保持一致性 */
function stubMatchMedia(initial: boolean) {
  const state = { matches: initial }
  const listeners: Array<(event: { matches: boolean }) => void> = []
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      get matches() {
        return state.matches
      },
      addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => listeners.push(cb),
      removeEventListener: () => undefined,
    })),
  )
  return {
    setMatches(matches: boolean) {
      state.matches = matches
      listeners.forEach((cb) => cb({ matches }))
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.removeAttribute('theme-mode')
  document.head.innerHTML = '<meta name="theme-color" content="#f3f3f3" />'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme', () => {
  it('defaults to system and resolves dark from the system preference', () => {
    stubMatchMedia(true)
    expect(getThemeMode()).toBe('system')
    expect(isDarkTheme()).toBe(true)
    expect(themeModeLabel()).toBe('跟随系统')
  })

  it('persists the selected mode and applies it to the document', () => {
    stubMatchMedia(false)
    setThemeMode('dark')
    expect(localStorage.getItem('joinyuu_theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('theme-mode')).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#181818')
  })

  it('returns to light when explicitly set and ignores the dark system preference', () => {
    stubMatchMedia(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.getAttribute('theme-mode')).toBe('light')
    expect(isDarkTheme('light')).toBe(false)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f3f3f3')
    expect(themeModeLabel('light')).toBe('浅色')
  })

  it('falls back to system for an invalid stored value', () => {
    localStorage.setItem('joinyuu_theme', 'invalid')
    expect(getThemeMode()).toBe('system')
  })

  it('follows system changes only while the mode is system', () => {
    const system = stubMatchMedia(false)
    initTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    system.setMatches(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    setThemeMode('light')
    system.setMatches(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  /* v51：切换期间必须冻结全站过渡，否则所有颜色过渡在同一帧一起起跑会造成拖影 */
  it('freezes transitions during the theme swap and releases them on the next frame', async () => {
    stubMatchMedia(false)
    applyTheme('dark')
    /* 同步阶段已加上冻结类：切换帧内不会有任何过渡补间 */
    expect(document.documentElement.classList.contains('theme-switching')).toBe(true)
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)))
    expect(document.documentElement.classList.contains('theme-switching')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
