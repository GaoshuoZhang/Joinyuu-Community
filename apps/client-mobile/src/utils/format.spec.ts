import { describe, expect, it } from 'vitest'
import { formatLocalDate, formatLocalDateTime, formatZhNumber, parseLocalDateTime } from './format'

describe('本地日期时间与数字格式', () => {
  it('严格解析本地业务时间，拒绝溢出日期和非契约格式', () => {
    expect(parseLocalDateTime('2026-09-19 08:05')).toEqual(new Date(2026, 8, 19, 8, 5))
    expect(parseLocalDateTime('2026-02-30 08:05')).toBeNull()
    expect(parseLocalDateTime('9/19/2026, 08:05')).toBeNull()
  })

  it('稳定输出本地分钟、日期和 zh-CN 数字', () => {
    const value = new Date(2026, 8, 19, 8, 5, 42)
    expect(formatLocalDateTime(value)).toBe('2026-09-19 08:05')
    expect(formatLocalDate(value)).toBe('2026-09-19')
    expect(formatLocalDateTime('bad')).toBe('—')
    expect(formatZhNumber(1234567)).toBe('1,234,567')
  })
})
