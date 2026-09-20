const zhNumberFormatter = new Intl.NumberFormat('zh-CN')

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

export function formatZhNumber(value: number): string {
  return zhNumberFormatter.format(value)
}

export function parseLocalDateTime(value: string): Date | null {
  const match = LOCAL_DATE_TIME.exec(value.trim())
  if (!match) return null
  const [, yearText, monthText, dayText, hourText = '0', minuteText = '0', secondText = '0'] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const date = new Date(year, month - 1, day, hour, minute, second)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) return null
  return date
}

export function formatLocalDateTime(value: Date | number | string): string {
  const date = typeof value === 'string' ? parseLocalDateTime(value) : new Date(value)
  if (!date || Number.isNaN(date.getTime())) return '—'
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatLocalDate(value: Date | number | string): string {
  return formatLocalDateTime(value).slice(0, 10)
}
