import { describe, expect, it } from 'vitest'
import { demandDateText } from './demand'

describe('demandDateText', () => {
  it('labels deliverBy as an expected delivery date', () => {
    expect(demandDateText({ deliverBy: '2026-10-31' })).toContain('预期交付')
  })

  it('labels deadline as the response cutoff date', () => {
    expect(demandDateText({ deadline: '2026-10-16' })).toBe('响应截止 2026-10-16')
  })

  it('keeps deliverBy labeled as expected delivery when no response cutoff is available', () => {
    expect(demandDateText({ deliverBy: '2026-10-31' })).toBe('预期交付 2026-10-31')
  })

  it('returns no date metadata when neither date is available', () => {
    expect(demandDateText({})).toBe('')
  })
})
