import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('HTTP 模式时间源', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 18, 16, 30, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('使用设备当前时间而不是 Mock 固定基准时间', async () => {
    const { formatMockDate, formatMockStamp, mockNowDate, mockNowMs } = await import('./runtime')

    expect(mockNowMs()).toBe(new Date(2026, 8, 18, 16, 30, 0, 0).getTime())
    expect(mockNowDate()).toEqual(new Date(2026, 8, 18, 16, 30, 0, 0))
    expect(formatMockDate()).toBe('2026-09-18')
    expect(formatMockStamp()).toBe('2026-09-18 16:30')
  })
})
