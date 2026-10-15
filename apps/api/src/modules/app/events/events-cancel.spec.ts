import { AppEventsService } from './events.service'

describe('取消报名时限', () => {
  afterEach(() => jest.useRealTimers())
  function fixture(status = 'approved', checkedIn = false) {
    const event = { id: 'EV1', title: '活动', status: 'published', startTime: '2026-10-19 12:00',
      rescheduledTo: '2026-10-20 12:00', endTime: '2026-10-20 14:00', cancelDeadlineHours: 6 }
    const tx = { $executeRaw: jest.fn(), eventEnrollment: {
      findUnique: jest.fn().mockResolvedValue({ id: 1, status, checkedIn, event }),
      update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null),
    } }
    const prisma = { $transaction: (fn: (value: typeof tx) => Promise<void>) => fn(tx) }
    const notify = { pushNoticeInTransaction: jest.fn() }
    const service = new AppEventsService({} as never, prisma as never, {} as never, {} as never,
      notify as never, {} as never, {} as never)
    return { service, tx }
  }
  it('改期后使用新的配置截止时间，等于截止时拒绝', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 5, 59))
    const { service, tx } = fixture()
    await expect(service.cancel('U1', 'EV1')).resolves.toEqual({ code: 0 })
    expect(tx.eventEnrollment.update).toHaveBeenCalled()
    jest.setSystemTime(new Date(2026, 9, 20, 6))
    await expect(service.cancel('U1', 'EV1')).rejects.toThrow('6 小时不可取消')
  })
  it.each(['pending', 'waitlisted'])('%s 不应用已通过报名的取消时限', async (status) => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 11))
    await expect(fixture(status).service.cancel('U1', 'EV1')).resolves.toEqual({ code: 0 })
  })
  it('已签到不能取消', async () => {
    await expect(fixture('approved', true).service.cancel('U1', 'EV1')).rejects.toThrow('已签到')
  })
  it('活动结束后待审和候补也不能再取消', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 14))
    for (const status of ['pending', 'waitlisted']) {
      const { service, tx } = fixture(status)
      await expect(service.cancel('U1', 'EV1')).rejects.toThrow('活动已结束')
      expect(tx.eventEnrollment.update).not.toHaveBeenCalled()
    }
  })
})
