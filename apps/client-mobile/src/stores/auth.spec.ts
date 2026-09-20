import { describe, expect, it } from 'vitest'
import { actionIdentityOptions } from './auth'
import type { UserIdentity } from '@/types'

describe('actionIdentityOptions', () => {
  it('hides individual when community individual is available and preserves order', () => {
    const identities: UserIdentity[] = [
      { type: 'community_enterprise', enterpriseId: 'E1' },
      { type: 'individual' },
      { type: 'external_enterprise', organizationName: '合作方' },
      { type: 'community_individual' },
    ]

    expect(actionIdentityOptions(identities)).toEqual([
      identities[0],
      identities[2],
      identities[3],
    ])
    expect(identities.map((identity) => identity.type)).toEqual([
      'community_enterprise',
      'individual',
      'external_enterprise',
      'community_individual',
    ])
  })

  it('retains individual when community individual is unavailable', () => {
    const identities: UserIdentity[] = [
      { type: 'individual' },
      { type: 'community_enterprise', enterpriseId: 'E1' },
    ]

    expect(actionIdentityOptions(identities)).toEqual(identities)
  })
})
