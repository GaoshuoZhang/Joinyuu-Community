/** v39：生成并下载活动日历文件（.ics，本地时间）。 */
export function downloadEventIcs(event: {
  id: string
  title: string
  startTime: string
  endTime: string
  location: string
  description?: string
}): void {
  const stamp = (value: string): string => {
    const [date, time = '00:00'] = value.trim().split(' ')
    const [y, m, d] = date.split('-')
    const [hh, mm] = time.split(':')
    return `${y}${m}${d}T${hh}${mm}00`
  }
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Joinyuu//Client//CN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@joinyuu.community`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${stamp(event.startTime)}`,
    `DTEND:${stamp(event.endTime)}`,
    `SUMMARY:${event.title}`,
    `LOCATION:${event.location}`,
    `DESCRIPTION:${(event.description ?? '').replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${event.title}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
