/** 当前时间（YYYY-MM-DD HH:mm）——与 formatNow 契约一致，服务器本地时区 */
export function formatNow(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 当前时间（YYYY-MM-DD HH:mm:ss）——登录日志等需秒级精度场景 */
export function formatNowSec(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Date → YYYY-MM-DD HH:mm（AdminUser.createdAt 等 DateTime 列展示格式化） */
export function formatDateTime(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 今日日期（YYYY-MM-DD） */
export function formatToday(): string {
  return formatNow().slice(0, 10)
}

/** 日期字符串加天数（YYYY-MM-DD），对齐 addDays 语义（服务器本地时区） */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
