export const HOME_MODULES = ['banner', 'entries', 'publish', 'activation', 'announcement', 'events', 'demands', 'articles'] as const
export type HomeModule = typeof HOME_MODULES[number]
export const THEME_ENTRY_KEYS = ['enterprise', 'talent', 'articles', 'mall', 'spaces', 'events'] as const
/** 等级配色数组长度：1–10 级各一色（个体与企业等级共用） */
export const LEVEL_COLOR_COUNT = 10
export interface EntryColors { background?: string; icon?: string; iconBackground?: string; text?: string; secondaryText?: string; border?: string }
export interface ThemeColors {
  primary?: string; accent?: string; primaryLight?: string; background?: string; surface?: string; text?: string; secondaryText?: string; heroStart?: string; heroEnd?: string
  border?: string; buttonBackground?: string; buttonText?: string; navigationBackground?: string; navigationText?: string; navigationActive?: string
  searchBackground?: string; searchText?: string; searchPlaceholder?: string; sectionTitle?: string; link?: string
  entryCards?: Partial<Record<typeof THEME_ENTRY_KEYS[number], EntryColors>>
  /** 1–10 级等级配色（按级号升序的 10 个颜色；等级标签实底 + 等级卡描边/实底） */
  levelColors?: string[]
}
export interface CustomerTheme {
  packageId: string
  schemaVersion: 1
  id: string
  name: string
  version: string
  brand?: { name?: string; slogan?: string; logo?: string; logoDark?: string; logoShape?: 'square' | 'wordmark'; homeBackground?: string; eyebrow?: string; headline?: string; highlight?: string }
  tokens?: { light?: ThemeColors; dark?: ThemeColors; radius?: 'small' | 'medium' | 'large' }
  layout?: { template?: 'default' | 'brand'; homeModules?: HomeModule[] }
}

/** Plain-text segments only: highlighting never introduces HTML from a theme package. */
export function brandHeadline(brand: CustomerTheme['brand']) {
  const title = brand?.headline || brand?.name || ''
  const highlight = brand?.highlight || ''
  const index = highlight ? title.indexOf(highlight) : -1
  return index < 0 ? { before: title, highlight: '', after: '' }
    : { before: title.slice(0, index), highlight, after: title.slice(index + highlight.length) }
}

/** Configured modules go first; omitted and future modules keep their default order. */
export function orderedHomeModules(theme: CustomerTheme | null): HomeModule[] {
  const selected = theme?.layout?.homeModules ?? []
  return [...new Set([...selected.filter((key) => HOME_MODULES.includes(key)), ...HOME_MODULES])]
}
function mix(color: string, target: number, amount: number) {
  return '#' + [1, 3, 5].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - amount) + target * amount).toString(16).padStart(2, '0')).join('')
}
function luminance(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const v = parseInt(color.slice(offset, offset + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
const isHex = (color: unknown): color is string => typeof color === 'string' && /^#[a-f0-9]{6}$/i.test(color)
function isLevelColors(value: unknown): value is string[] {
  return Array.isArray(value) && value.length === LEVEL_COLOR_COUNT && value.every(isHex)
}
/** 主题是否提供了完整 10 级等级配色（决定等级标签与等级卡是否使用等级色，否则沿用公版样式） */
export function hasThemeLevelColors(theme: CustomerTheme | null): boolean {
  return isLevelColors(theme?.tokens?.light?.levelColors) || isLevelColors(theme?.tokens?.dark?.levelColors)
}
function colorVariables(colors: ThemeColors = {}, dark = false) {
  const values: Record<string, string> = {}
  const mapping: Record<string, string[]> = {
    background: ['--td-bg-color-page'], surface: ['--td-bg-color-container', '--td-bg-color-container-active'],
    text: ['--td-text-color-primary'], secondaryText: ['--td-text-color-secondary'],
    border: ['--td-component-border', '--td-border-color'],
    navigationBackground: ['--td-tab-bar-bg-color'], navigationText: ['--td-tab-bar-color'], navigationActive: ['--td-tab-bar-active-color'],
    searchBackground: ['--app-search-background'], searchText: ['--td-search-text-color'], searchPlaceholder: ['--td-search-placeholder-color', '--td-search-icon-color'],
    sectionTitle: ['--app-section-title'], link: ['--app-theme-link'],
    accent: ['--app-theme-accent'], heroStart: ['--app-theme-hero-start'], heroEnd: ['--app-theme-hero-end'],
  }
  for (const [key, variables] of Object.entries(mapping)) {
    const color = colors[key as keyof ThemeColors]
    if (typeof color === 'string' && /^#[a-f0-9]{6}$/i.test(color)) for (const variable of variables) values[variable] = color
  }
  const primary = colors.primary
  if (primary && /^#[a-f0-9]{6}$/i.test(primary)) {
    for (let i = 1; i <= 10; i++) values[`--td-brand-color-${i}`] = i <= 7 ? mix(primary, dark ? 0 : 255, (7 - i) / 7) : mix(primary, dark ? 255 : 0, (i - 7) / 6)
    values['--td-brand-color'] = primary
    values['--td-brand-color-active'] = values['--td-brand-color-8']
    values['--td-brand-color-focus'] = values['--td-brand-color-2']
    values['--td-brand-color-disabled'] = values['--td-brand-color-3']
    values['--td-brand-color-light'] = mix(primary, dark ? 0 : 255, dark ? 0.82 : 0.94)
    values['--td-button-primary-color'] = luminance(primary) > 0.179 ? '#000000' : '#ffffff'
    // Banner text uses the fixed inverse text color; keep its gradient dark enough.
    let banner = primary
    while (luminance(banner) > 0.1) banner = mix(banner, 0, 0.1)
    values['--client-brand-gradient'] = `linear-gradient(135deg, ${mix(banner, 0, 0.2)} 0%, ${banner} 100%)`
  }
  if (colors.buttonBackground && /^#[a-f0-9]{6}$/i.test(colors.buttonBackground)) {
    const background = colors.buttonBackground
    values['--td-button-primary-bg-color'] = background
    values['--td-button-primary-border-color'] = background
    const foreground = colors.buttonText && /^#[a-f0-9]{6}$/i.test(colors.buttonText) ? colors.buttonText : luminance(background) > 0.179 ? '#000000' : '#ffffff'
    values['--td-button-primary-active-bg-color'] = mix(background, luminance(foreground) < 0.179 ? 255 : 0, 0.12)
    values['--td-button-primary-active-border-color'] = values['--td-button-primary-active-bg-color']
    values['--td-button-primary-disabled-bg'] = mix(background, dark ? 0 : 255, 0.6)
    values['--td-button-primary-disabled-border-color'] = values['--td-button-primary-disabled-bg']
    values['--td-button-primary-color'] = luminance(background) > 0.179 ? '#000000' : '#ffffff'
  }
  if (colors.buttonText && /^#[a-f0-9]{6}$/i.test(colors.buttonText)) values['--td-button-primary-color'] = colors.buttonText
  /* 等级配色：--app-level-N 为该级实色（等级标签实底、等级卡描边与已达成实底），
   * --app-level-N-text 为实底上的文字色（按亮度自动选黑/白，与主按钮同一口径） */
  if (isLevelColors(colors.levelColors)) {
    colors.levelColors.forEach((color, index) => {
      const level = index + 1
      values[`--app-level-${level}`] = color
      values[`--app-level-${level}-text`] = luminance(color) > 0.179 ? '#000000' : '#ffffff'
    })
  }
  if (colors.accent && /^#[a-f0-9]{6}$/i.test(colors.accent)) {
    const accent = colors.accent
    /* 标签品牌槽（Tag light 变体 primary 主题 + CheckTag 选中态）：主题提供强调色时全站标签改用强调色，
     * 呈现比主色更活泼的色彩；成功/警告/错误等语义状态色不受影响。
     * 浅色文字压暗一档（多数强调色直接作正文对比不足，如 #dc590d 仅 3.8:1），底色与 brand-color-light 同口径混色。 */
    values['--td-tag-primary-color'] = dark ? accent : mix(accent, 0, 0.15)
    values['--td-tag-primary-light-color'] = mix(accent, dark ? 0 : 255, dark ? 0.82 : 0.94)
  }
  for (const key of THEME_ENTRY_KEYS) {
    const card = colors.entryCards?.[key]
    if (!card) continue
    for (const role of ['background', 'icon', 'iconBackground', 'text', 'secondaryText', 'border'] as const) {
      const color = card[role]
      if (color && /^#[a-f0-9]{6}$/i.test(color)) values[`--app-entry-${key}-${role}`] = color
    }
  }
  if (colors.primaryLight && /^#[a-f0-9]{6}$/i.test(colors.primaryLight)) values['--td-brand-color-light'] = colors.primaryLight
  if (colors.surface && /^#[a-f0-9]{6}$/i.test(colors.surface)) values['--app-navbar-bg-rgb'] = [1, 3, 5].map((offset) => parseInt(colors.surface!.slice(offset, offset + 2), 16)).join(', ')
  return values
}
export function customerThemeCss(theme: CustomerTheme | null): string {
  if (!theme) return ''
  const radius = { small: '4px', medium: '8px', large: '16px' }[theme.tokens?.radius ?? 'medium']
  const control = { small: '4px', medium: '8px', large: '12px' }[theme.tokens?.radius ?? 'medium']
  const base = theme.tokens?.radius ? `--td-radius-default:${control};--td-radius-medium:${control};--td-radius-large:${radius};--td-radius-extraLarge:${radius};` : ''
  const rule = (colors?: ThemeColors, dark = false) => Object.entries(colorVariables(colors, dark)).map(([key, value]) => `${key}:${value};`).join('')
  return `:root:root:root{${base}${rule(theme.tokens?.light)}}:root:root:root.dark{${rule(theme.tokens?.dark ?? theme.tokens?.light, true)}}`
}
export function applyCustomerTheme(theme: CustomerTheme | null) {
  let style = document.getElementById('customer-theme')
  if (!theme) { style?.remove(); return }
  if (!style) { style = document.createElement('style'); style.id = 'customer-theme'; document.head.append(style) }
  style.textContent = customerThemeCss(theme)
}
