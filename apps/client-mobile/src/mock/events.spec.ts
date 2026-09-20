import { beforeEach, describe, expect, it } from 'vitest'
import { enrollmentsByUid, events } from './db'
import { enrollEvent, fetchEvent } from './handlers/events'
import { issueToken } from './session'

describe('mock event enrollment', () => {
  beforeEach(() => {
    localStorage.clear()
    issueToken('U1015', [{ type: 'individual' }])
  })

  it('preserves enrollmentOpen in event responses', async () => {
    const fixture = events.find((event) => event.id === 'EV6003')
    expect(fixture?.enrollmentOpen).toBe(false)

    const event = await fetchEvent('EV6003')
    expect(event.enrollmentOpen).toBe(false)
  })

  it('rejects enrollment while enrollmentOpen is false with the backend message', async () => {
    await expect(enrollEvent('EV6003')).rejects.toEqual(
      expect.objectContaining({ code: 400, message: '报名暂未开放' }),
    )
  })

  it('keeps a cancelled event viewable only to an enrolled member', async () => {
    const event = events.find((item) => item.status === 'published')!
    const originalStatus = event.status
    const originalEnrollments = enrollmentsByUid.U1015
    event.status = 'cancelled'
    enrollmentsByUid.U1015 = [{
      id: 'EN-DETAIL',
      eventId: event.id,
      eventTitle: event.title,
      startTime: event.startTime,
      location: event.location,
      status: 'approved',
      checkedIn: false,
    }]
    try {
      await expect(fetchEvent(event.id)).resolves.toMatchObject({ id: event.id, status: 'cancelled' })
      issueToken('U1009', [{ type: 'individual' }])
      await expect(fetchEvent(event.id)).rejects.toEqual(expect.objectContaining({ code: 404 }))
    } finally {
      event.status = originalStatus
      if (originalEnrollments) enrollmentsByUid.U1015 = originalEnrollments
      else delete enrollmentsByUid.U1015
    }
  })
})
