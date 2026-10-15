import { describe, expect, it } from 'vitest'
import { canCancelEnrollment } from './enrollment'

const item = { status: 'approved', startTime: '2026-10-20 12:00', cancelDeadlineHours: 6 }
const cutoff = new Date(2026, 9, 20, 6).getTime()
describe('报名取消规则', () => {
  it('按配置时限并在截止的那一刻停止取消', () => {
    expect(canCancelEnrollment(item, cutoff - 1)).toBe(true)
    expect(canCancelEnrollment(item, cutoff)).toBe(false)
    expect(canCancelEnrollment(item, cutoff + 1)).toBe(false)
  })
  it('待审和候补不受已通过报名的时限约束', () => {
    for (const status of ['pending', 'waitlisted']) expect(canCancelEnrollment({ ...item, status }, cutoff)).toBe(true)
  })
  it('签到、取消的活动和不可取消报名状态均被阻止', () => {
    expect(canCancelEnrollment({ ...item, checkedIn: true }, cutoff - 1)).toBe(false)
    expect(canCancelEnrollment({ ...item, eventStatus: 'cancelled' }, cutoff - 1)).toBe(false)
    expect(canCancelEnrollment({ ...item, status: 'pending', eventStatus: 'ended' }, cutoff - 1)).toBe(false)
    expect(canCancelEnrollment({ ...item, status: 'waitlisted', endTime: '2026-10-20 06:00' }, cutoff)).toBe(false)
    for (const status of ['rejected', 'cancelled']) expect(canCancelEnrollment({ ...item, status }, cutoff - 1)).toBe(false)
  })
  it('使用改期时间并拒绝无效时间', () => {
    expect(canCancelEnrollment({ ...item, rescheduledTo: '2026-10-21 12:00' }, cutoff)).toBe(true)
    expect(canCancelEnrollment({ ...item, startTime: 'invalid' }, cutoff)).toBe(false)
  })
})
