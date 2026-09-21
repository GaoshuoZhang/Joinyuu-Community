import { beforeEach, describe, expect, it } from 'vitest'
import { enterprises } from './db'
import { fetchMyLeases } from './handlers/leases'
import { issueToken } from './session'

/* 由种子 endDate 与提醒天数（15 天）推导期望状态，避免断言依赖真实系统时间 */
function expectedLeaseStatus(endDate: string, remindDays = 15): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const reminder = new Date(now.getFullYear(), now.getMonth(), now.getDate() + remindDays)
  const reminderEnd = `${reminder.getFullYear()}-${pad(reminder.getMonth() + 1)}-${pad(reminder.getDate())}`
  if (endDate < today) return 'expired'
  if (endDate <= reminderEnd) return 'expiring'
  return 'active'
}

describe('mock my leases', () => {
  beforeEach(() => {
    localStorage.clear()
    const enterprise = enterprises.find((item) => item.id === 'E9001')
    if (enterprise) enterprise.contactUid = 'U1004'
  })

  it('returns individual leases and never leaks custom leases or source-only fields', async () => {
    issueToken('U1001', [{ type: 'individual' }])
    const result = await fetchMyLeases()
    expect(result.map((lease) => lease.id)).toContain('LSM1001')
    expect(result.map((lease) => lease.id)).not.toContain('LSM9999')
    expect(result.find((lease) => lease.id === 'LSM1001')?.status).toBe(expectedLeaseStatus('2026-09-30'))
    expect(result[0]).not.toHaveProperty('renterId')
    expect(result[0]).not.toHaveProperty('note')
    expect(result[0]).not.toHaveProperty('deletedAt')
  })

  it('uses mutable current enterprise contact state, not token identities', async () => {
    issueToken('U1001', [{ type: 'community_enterprise', enterpriseId: 'E9001' }])
    expect((await fetchMyLeases()).some((lease) => lease.id === 'LSM2001')).toBe(false)

    const enterprise = enterprises.find((item) => item.id === 'E9001')
    if (enterprise) enterprise.contactUid = 'U1001'
    const enterpriseLeases = (await fetchMyLeases()).filter((lease) => lease.renterType === 'enterprise')
    expect(enterpriseLeases).toHaveLength(2)
    expect(enterpriseLeases.find((lease) => lease.id === 'LSM2001')?.status).toBe('active')
    expect(enterpriseLeases.find((lease) => lease.id === 'LSM2002')?.status).toBe('terminated')
  })

  it('allows the current responsible person and excludes an ordinary member', async () => {
    issueToken('U1004', [{ type: 'individual' }])
    expect((await fetchMyLeases()).some((lease) => lease.id === 'LSM2001')).toBe(true)

    issueToken('U1006', [{ type: 'community_enterprise', enterpriseId: 'E9001' }])
    expect((await fetchMyLeases()).some((lease) => lease.id === 'LSM2001')).toBe(false)
  })
})
