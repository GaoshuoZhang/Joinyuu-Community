import type { SpaceSlot } from '@/types'

export type SpaceRangeInvalidReason = 'end_not_later' | 'exceeds_max' | 'occupied' | 'gap'

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

export function availabilityEndpoints(slots: SpaceSlot[]): string[] {
  return [...new Set(slots.flatMap((slot) => [slot.start, slot.end]))].sort(
    (left, right) => timeToMinutes(left) - timeToMinutes(right),
  )
}

export function canStartAt(slots: SpaceSlot[], time: string): boolean {
  return slots.some((slot) => slot.start === time && !slot.occupied)
}

export function validateSpaceRange(
  slots: SpaceSlot[],
  start: string,
  end: string,
  maxHours: number,
): SpaceRangeValidation {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  const durationHours = (endMinutes - startMinutes) / 60

  if (endMinutes <= startMinutes) return { valid: false, durationHours, reason: 'end_not_later' }
  if (maxHours > 0 && durationHours > maxHours) return { valid: false, durationHours, reason: 'exceeds_max' }

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
