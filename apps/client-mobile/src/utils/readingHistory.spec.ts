import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addReadingHistory, listReadingHistory } from './readingHistory'

describe('本机阅读历史', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 8, 5, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('使用稳定的本地业务时间格式写入记录', () => {
    addReadingHistory({ id: 'A1', title: '测试文章' })
    expect(listReadingHistory()).toEqual([{ id: 'A1', title: '测试文章', at: '2026-09-19 08:05' }])
  })
})
