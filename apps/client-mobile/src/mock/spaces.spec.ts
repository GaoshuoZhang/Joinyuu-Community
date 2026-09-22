import { beforeEach, describe, expect, it } from 'vitest'
import { occupiedSlots, spaces } from './db'
import { createReservation, fetchAvailability, fetchMyReservation, fetchMyReservations } from './handlers/spaces'
import { formatMockDate } from './runtime'
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
    issueToken('U1004', [{ type: 'community_enterprise', enterpriseId: 'E9001' }])
    await expect(fetchMyReservation('SR5001')).rejects.toEqual(expect.objectContaining({ code: 404 }))
  })
})

describe('mock space reservation attendees', () => {
  beforeEach(() => {
    localStorage.clear()
    issueToken('U1001', [{ type: 'community_individual' }])
  })

  /** 岛屿咖啡区（S9001）免审核、容量 40；取当日第一个未被占用的整点时段 */
  async function freeSlot() {
    const date = formatMockDate()
    const slot = (await fetchAvailability('S9001', date)).find((item) => !item.occupied)
    if (!slot) throw new Error('当日无可用时段')
    return { date, start: slot.start, end: slot.end }
  }

  it('persists the submitted attendees count into the detail payload', async () => {
    const slot = await freeSlot()
    await createReservation({ spaceId: 'S9001', ...slot, topic: '人数口径', attendees: 5 })
    const created = (await fetchMyReservations()).find((item) => item.purpose === '人数口径')
    expect(created).toBeDefined()
    await expect(fetchMyReservation(created!.id)).resolves.toMatchObject({ attendees: 5 })
  })

  it('falls back to 1 attendee when the payload omits it', async () => {
    const slot = await freeSlot()
    await createReservation({ spaceId: 'S9001', ...slot, topic: '默认人数' })
    const created = (await fetchMyReservations()).find((item) => item.purpose === '默认人数')
    await expect(fetchMyReservation(created!.id)).resolves.toMatchObject({ attendees: 1 })
  })

  it('rejects attendees beyond the space capacity', async () => {
    const slot = await freeSlot()
    await expect(
      createReservation({ spaceId: 'S9001', ...slot, attendees: 41 }),
    ).rejects.toEqual(expect.objectContaining({ code: 400, message: '参与人数不能超过空间容量 40 人' }))
  })
})
