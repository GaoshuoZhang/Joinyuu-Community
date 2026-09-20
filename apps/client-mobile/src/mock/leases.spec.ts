import { beforeEach, describe, expect, it } from 'vitest'
import { enterprises } from './db'
import { fetchMyLeases } from './handlers/leases'
import { issueToken } from './session'

describe('mock my leases', () => {
  beforeEach(() => {
    localStorage.clear()
    const enterprise = enterprises.find((item) => item.id === 'E2001')
    if (enterprise) enterprise.contactUid = 'U1004'
  })

  it('returns individual leases and never leaks custom leases or source-only fields', async () => {
    issueToken('U1001', [{ type: 'individual' }])
    const result = await fetchMyLeases()
    expect(result.map((lease) => lease.id)).toContain('LSM1001')
    expect(result.map((lease) => lease.id)).not.toContain('LSM9999')
    expect(result.find((lease) => lease.id === 'LSM1001')?.status).toBe('expiring')
    expect(result[0]).not.toHaveProperty('renterId')
    expect(result[0]).not.toHaveProperty('note')
    expect(result[0]).not.toHaveProperty('deletedAt')
  })

  it('uses mutable current enterprise contact state, not token identities', async () => {
    issueToken('U1001', [{ type: 'community_enterprise', enterpriseId: 'E2001' }])
    expect((await fetchMyLeases()).some((lease) => lease.id === 'LSM2001')).toBe(false)

    const enterprise = enterprises.find((item) => item.id === 'E2001')
    if (enterprise) enterprise.contactUid = 'U1001'
    const enterpriseLeases = (await fetchMyLeases()).filter((lease) => lease.renterType === 'enterprise')
    expect(enterpriseLeases).toHaveLength(2)
    expect(enterpriseLeases.find((lease) => lease.id === 'LSM2001')?.status).toBe('active')
    expect(enterpriseLeases.find((lease) => lease.id === 'LSM2002')?.status).toBe('terminated')
  })

  it('allows the current responsible person and excludes an ordinary member', async () => {
    issueToken('U1004', [{ type: 'individual' }])
    expect((await fetchMyLeases()).some((lease) => lease.id === 'LSM2001')).toBe(true)

    issueToken('U1006', [{ type: 'community_enterprise', enterpriseId: 'E2001' }])
    expect((await fetchMyLeases()).some((lease) => lease.id === 'LSM2001')).toBe(false)
  })
})
