import { THEME_ENTRY_KEYS } from '@/utils/customerTheme'

/* 类别配色：按类别文案稳定散列到主题入口卡的六色家族（--app-entry-* 变量由主题注入，
 * 明暗两态随 .dark 自动切换）。列表标签（CategoryTag）与筛选 chip 共用本模块，
 * 保证「同一类别在筛选栏与列表里颜色一致」。 */

/** murmur3 收尾混合常数：对哈希做一次 avalanche。
 * 直接拿 djb2 取模在 6 个色位下分布不均（实测常见类别会集中到 1–2 个色位，
 * 同一个列表里多张卡显示同色），混合后各色位数量明显均衡。 */
function mixAvalanche(hash: number): number {
  let h = hash >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 2246822507) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 3266489909) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** djb2 + avalanche：把类别文案映射到固定下标（同文案永远同色，不同文案尽量分散） */
function hashIndex(value: string, buckets: number): number {
  let hash = 5381
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  return mixAvalanche(hash) % buckets
}

export type CategoryEntryKey = typeof THEME_ENTRY_KEYS[number]

/** 类别文案对应的主题入口色键 */
export function categoryEntryKey(label: string): CategoryEntryKey {
  return THEME_ENTRY_KEYS[hashIndex(label, THEME_ENTRY_KEYS.length)]
}

/** 类别配色（前景色 + 同色系浅底 + 同色描边）。
 * 兜底链：入口配色 → 标签品牌槽（主题强调色/公版品牌色）→ TDesign 品牌变量。 */
export function categoryColorStyle(label: string): Record<string, string> {
  const key = categoryEntryKey(label)
  const foreground = `var(--app-entry-${key}-icon, var(--td-tag-primary-color, var(--td-brand-color)))`
  const background = `var(--app-entry-${key}-iconBackground, var(--td-tag-primary-light-color, var(--td-brand-color-light)))`
  return { color: foreground, backgroundColor: background, borderColor: background }
}
