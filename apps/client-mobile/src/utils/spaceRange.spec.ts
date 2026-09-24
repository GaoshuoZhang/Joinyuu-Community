import { describe, expect, it } from 'vitest'
import type { SpaceSlot } from '@/types'
import { availabilityEndpoints, canStartAt, formatSpaceDuration, validateSpaceRange } from './spaceRange'

const slots: SpaceSlot[] = [
  { start: '09:00', end: '10:00', occupied: false },
  { start: '10:00', end: '11:00', occupied: false },
  { start: '11:00', end: '12:00', occupied: true },
  { start: '14:00', end: '15:00', occupied: false },
  { start: '16:00', end: '17:00', occupied: false },
]

describe('space range selection', () => {
  it('builds ordered unique endpoints and only starts on free segments', () => {
    expect(availabilityEndpoints(slots)).toEqual(['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'])
    expect(canStartAt(slots, '10:00')).toBe(true)
    expect(canStartAt(slots, '11:00')).toBe(false)
    expect(canStartAt(slots, '15:00')).toBe(false)
  })

  it('accepts a contiguous free range and derives its duration', () => {
    expect(validateSpaceRange(slots, '09:00', '11:00')).toEqual({ valid: true, durationHours: 2 })
  })

  it('rejects ranges that cross occupied intervals or schedule gaps', () => {
    expect(validateSpaceRange(slots, '10:00', '12:00').reason).toBe('occupied')
    expect(validateSpaceRange(slots, '10:00', '14:00').reason).toBe('occupied')
    expect(validateSpaceRange(slots, '14:00', '16:00').reason).toBe('gap')
  })

  it('rejects non-later endpoints', () => {
    expect(validateSpaceRange(slots, '10:00', '10:00').reason).toBe('end_not_later')
  })

  it('formats exact and partial-hour ranges without rounding', () => {
    expect(formatSpaceDuration('09:00', '11:00')).toBe('2 小时')
    expect(formatSpaceDuration('09:00', '10:30')).toBe('1 小时 30 分钟')
    expect(formatSpaceDuration('23:00', '23:59')).toBe('59 分钟')
  })
})
