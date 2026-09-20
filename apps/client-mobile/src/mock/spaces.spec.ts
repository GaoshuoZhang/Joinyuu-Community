import { beforeEach, describe, expect, it } from 'vitest'
import { occupiedSlots, spaces } from './db'
import { fetchAvailability, fetchMyReservation } from './handlers/spaces'
import { issueToken } from './session'

describe('mock space availability', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('treats pending reservations as occupied', () => {
    expect(occupiedSlots('S1002', '2026-09-22')).toContainEqual({ start: '10:00', end: '12:00' })
  })

  it('does not generate slots across gaps between open windows', async () => {
    const space = spaces[0]
    const original = space.openHours
    space.openHours = [{ start: '09:00', end: '11:00' }, { start: '14:00', end: '16:00' }]
    try {
      const slots = await fetchAvailability(space.id, '2026-10-10')
      expect(slots.map((slot) => `${slot.start}-${slot.end}`)).toEqual([
        '09:00-10:00',
        '10:00-11:00',
        '14:00-15:00',
        '15:00-16:00',
      ])
    } finally {
      space.openHours = original
    }
  })

  it('returns reservation detail only to its owner', async () => {
    issueToken('U1001', [{ type: 'community_individual' }])
    await expect(fetchMyReservation('SR5001')).resolves.toMatchObject({
      purpose: '项目方案评审',
      attendees: 6,
      records: expect.any(Array),
    })
    issueToken('U1004', [{ type: 'community_enterprise', enterpriseId: 'E2001' }])
    await expect(fetchMyReservation('SR5001')).rejects.toEqual(expect.objectContaining({ code: 404 }))
  })
})
