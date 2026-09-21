import { parseLocalDateTime } from './format'

const pad = (n: number) => String(n).padStart(2, '0')

/** ICS 文本字段转义（RFC 5545）：反斜杠、逗号、分号与换行 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** 本地时间 → ICS 时间戳（YYYYMMDDTHHmmss，浮动本地时区）。
 * 复用 format 的本地解析能力，兼容「YYYY-MM-DD HH:mm」与 ISO 的 T 分隔串。 */
function icsStamp(value: string): string {
  const date = parseLocalDateTime(value)
  if (!date) return ''
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/** v39：生成并下载活动日历文件（.ics，本地时间）。 */
export function downloadEventIcs(event: {
  id: string
  title: string
  startTime: string
  endTime: string
  location: string
  description?: string
}): void {
  const now = new Date()
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Joinyuu//Client//CN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@joinyuu.community`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsStamp(event.startTime)}`,
    `DTEND:${icsStamp(event.endTime)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `DESCRIPTION:${escapeIcsText(event.description ?? '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  /* 文件名过滤路径/系统非法字符（含反斜杠），为空时兜底 event */
  const safeTitle = event.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'event'
  link.download = `${safeTitle}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
