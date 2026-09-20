import { describe, expect, it } from 'vitest'
import { buildProfileMoreEntries } from './profileMenu'

describe('profile more entries', () => {
  it('shows the talent registration entry to users without a community individual identity', () => {
    const entries = buildProfileMoreEntries(false, 0)
    expect(entries[0]).toMatchObject({ path: '/intros/talent', label: '人才登记' })
  })

  it('hides the talent registration entry from community individual users', () => {
    const entries = buildProfileMoreEntries(true, 2)
    expect(entries.some((entry) => entry.path === '/intros/talent')).toBe(false)
    expect(entries.find((entry) => entry.path === '/notices')?.note).toBe('2 条未读')
  })
})
