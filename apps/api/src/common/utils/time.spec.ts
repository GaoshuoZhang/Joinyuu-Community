import { addDays, formatDateTime, formatNow, formatNowSec, formatToday } from './time'

describe('time utils', () => {
  it('formatToday 返回服务器本地日期 YYYY-MM-DD', () => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    expect(formatToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(formatToday()).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
  })

  it('formatNow / formatNowSec 格式正确', () => {
    expect(formatNow()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(formatNowSec()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('formatDateTime 对固定时间补零', () => {
    expect(formatDateTime(new Date(2026, 0, 5, 9, 8))).toBe('2026-01-05 09:08')
    expect(formatDateTime(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31 23:59')
  })

  it('addDays 正数跨月与跨年', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02')
  })

  it('addDays 负数跨月与跨年', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31')
    expect(addDays('2026-03-02', -30)).toBe('2026-01-31')
  })

  it('addDays 0 天不变', () => {
    expect(addDays('2026-09-12', 0)).toBe('2026-09-12')
  })
})
