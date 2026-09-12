/** 统一展示 ISO 日期时间中的日期部分，避免各页面重复硬切字符串。 */
export function formatDateOnly(value?: string | null): string {
  if (!value) return '—'
  const match = value.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0] ?? value
}

/** 日历查询使用的稳定 YYYY-MM 键。 */
export function formatMonthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}
