import type { SpaceSlot } from '@/types'

export type SpaceRangeInvalidReason = 'end_not_later' | 'occupied' | 'gap'

export interface SpaceRangeValidation {
  valid: boolean
  durationHours: number
  reason?: SpaceRangeInvalidReason
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

export function formatSpaceDuration(start: string, end: string): string {
  const totalMinutes = Math.max(0, timeToMinutes(end) - timeToMinutes(start))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} 分钟`
  if (!minutes) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分钟`
}

/* 计费小时数：不足 1 小时按 1 小时计（全天开放结束时间为 23:59，N 小时 59 分按 N+1 小时计）。
 * 与后端 common/spaces/booking-fee.ts 同一算法，仅用于展示与余额预判。 */
export function billableHours(start: string, end: string): number {
  if (!start || !end) return 0
  const minutes = timeToMinutes(end) - timeToMinutes(start)
  return minutes > 0 ? Math.ceil(minutes / 60) : 0
}

/** 预约费用（积分）= 计费小时 × 每小时积分；feePerHour 为 0 表示免费 */
export function spaceFeePoints(feePerHour: number, start: string, end: string): number {
  if (!feePerHour || feePerHour <= 0) return 0
  return billableHours(start, end) * feePerHour
}

export function availabilityEndpoints(slots: SpaceSlot[]): string[] {
  return [...new Set(slots.flatMap((slot) => [slot.start, slot.end]))].sort(
    (left, right) => timeToMinutes(left) - timeToMinutes(right),
  )
}

export function canStartAt(slots: SpaceSlot[], time: string): boolean {
  return slots.some((slot) => slot.start === time && !slot.occupied)
}

/* 可选范围只由当日开放时段（后端按空间开放时间-关闭时间下发）决定：
 * 结束需晚于开始，且区间内每段都必须连续且在开放时段内、未被占用。 */
export function validateSpaceRange(
  slots: SpaceSlot[],
  start: string,
  end: string,
): SpaceRangeValidation {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  const durationHours = (endMinutes - startMinutes) / 60

  if (endMinutes <= startMinutes) return { valid: false, durationHours, reason: 'end_not_later' }

  const ordered = [...slots].sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start))
  let cursor = startMinutes
  while (cursor < endMinutes) {
    const segment = ordered.find(
      (slot) => timeToMinutes(slot.start) <= cursor && cursor < timeToMinutes(slot.end),
    )
    if (!segment) return { valid: false, durationHours, reason: 'gap' }
    if (segment.occupied) return { valid: false, durationHours, reason: 'occupied' }
    cursor = Math.min(timeToMinutes(segment.end), endMinutes)
  }

  return { valid: true, durationHours }
}
