import { describe, expect, it } from 'vitest'
import { fenToYuan, formatFen, formatFenPlain } from './money'

describe('money formatting', () => {
  it('formats integer fen with two decimals and grouping', () => {
    expect(formatFen(2990)).toBe('¥29.90')
    expect(formatFen(0)).toBe('¥0.00')
    expect(formatFen(123456789)).toBe('¥1,234,567.89')
    expect(formatFen(5)).toBe('¥0.05')
  })

  it('supports plain text and invalid values', () => {
    expect(formatFenPlain(2990)).toBe('29.90')
    expect(formatFen(Number.NaN)).toBe('¥0.00')
    expect(fenToYuan(2990)).toBe(29.9)
  })
})
