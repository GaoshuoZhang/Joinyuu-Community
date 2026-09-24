import type { CommunityEvent, Space } from '@prisma/client'

/* 活动占用空间的唯一口径（客户端可约时段 / 后台使用看板 / 后台空间详情 / 预约审核冲突校验共用）：
 * schema 无 spaceId 外键，按活动「地点」文本近似匹配空间——空间名包含匹配 + 空间地址完全相等匹配
 * （避免用楼层级地址做包含匹配导致同层多个空间互相误判，也避免空串恒真）；
 * 跨天活动按日展开：首日占用到 23:59、末日从 00:00 起、中间日整天占用。 */

type EventLike = Pick<CommunityEvent, 'location' | 'startTime' | 'endTime'>
type SpaceLike = Pick<Space, 'name' | 'location'>

/** 活动地点是否命中该空间（只看地点，不含时间维度） */
export function eventOccupiesSpace(event: EventLike, space: SpaceLike): boolean {
  const loc = (event.location ?? '').trim()
  if (!loc) return false
  const name = (space.name ?? '').trim()
  const address = (space.location ?? '').trim()
  if (name && loc.includes(name)) return true
  return Boolean(address) && loc === address
}

/** 活动是否覆盖指定日期（含跨天活动的中间日期） */
export function eventCoversDate(event: EventLike, date: string): boolean {
  const start = event.startTime.slice(0, 10)
  const end = event.endTime.slice(0, 10)
  return start <= date && date <= end
}

/** 活动覆盖的全部日期（按日展开；异常起止顺序时退化为开始日） */
export function eventDates(event: EventLike): string[] {
  const start = event.startTime.slice(0, 10)
  const end = event.endTime.slice(0, 10)
  if (end < start) return [start]
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

/** 活动在某日的占用时段（HH:mm，按天裁剪）；不覆盖该日时返回 null */
export function eventWindowOn(event: EventLike, date: string): { start: string; end: string } | null {
  if (!eventCoversDate(event, date)) return null
  const start = date === event.startTime.slice(0, 10) ? event.startTime.slice(11, 16) : '00:00'
  const end = date === event.endTime.slice(0, 10) ? event.endTime.slice(11, 16) : '23:59'
  return { start, end }
}

/** 活动是否占用某日的 [start, end) 时窗（三参均为 HH:mm 串） */
export function eventBlocksWindow(event: EventLike, date: string, start: string, end: string): boolean {
  const win = eventWindowOn(event, date)
  if (!win) return false
  return start < win.end && win.start < end
}