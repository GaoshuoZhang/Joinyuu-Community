import { describe, expect, it } from 'vitest'
import { actionIdentityOptions, authorizedActionIdentities } from './auth'
import type { UserIdentity } from '@/types'

describe('企业操作身份授权', () => {
  const base: UserIdentity[] = [{ type: 'community_enterprise', enterpriseId: 'E1', enterpriseName: '旧企业名' }, { type: 'individual' }]
  it('登录会话中的企业身份不能补回已被权限接口排除的企业', () => {
    expect(authorizedActionIdentities(base, [])).toEqual([{ type: 'individual' }])
  })
  it('已授权企业合并去重并使用权限接口中的最新资料', () => {
    const authorized: UserIdentity = { type: 'community_enterprise', enterpriseId: 'E1', enterpriseName: '最新企业名' }
    expect(authorizedActionIdentities(base, [authorized, authorized])).toEqual([authorized, { type: 'individual' }])
  })
})

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
