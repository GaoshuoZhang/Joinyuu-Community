import { describe, expect, it } from 'vitest'
import { pointsSourceLabel } from './points'

describe('pointsSourceLabel', () => {
  it('maps API source codes to Chinese labels', () => {
    expect(pointsSourceLabel('rule')).toBe('自动发放')
    expect(pointsSourceLabel('manual')).toBe('手动发放')
    expect(pointsSourceLabel('redemption')).toBe('商城兑换')
  })

  it('keeps Chinese sources from legacy data as-is', () => {
    expect(pointsSourceLabel('商城兑换')).toBe('商城兑换')
    expect(pointsSourceLabel('管理员调整')).toBe('管理员调整')
  })

  it('falls back for empty or unknown sources', () => {
    expect(pointsSourceLabel('')).toBe('积分变动')
    expect(pointsSourceLabel(null)).toBe('积分变动')
    expect(pointsSourceLabel('unknown_code')).toBe('unknown_code')
  })
})
