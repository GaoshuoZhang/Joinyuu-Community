import type { LeaseStatus, MyLease } from '@/types'
import { enterprises, leases } from '@/mock/db'
import { fail, withLatency } from '@/mock/latency'
import { formatMockDate, mockNowDate } from '@/mock/runtime'
import { readPayload } from '@/mock/session'

const LEASE_EXPIRE_REMIND_DAYS = 15

function requireUid(): string {
  const payload = readPayload()
  if (!payload) fail(401, '未登录或登录已过期')
  return payload.sub
}

function addDays(date: Date, days: number): string {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
  return formatMockDate(result.getTime())
}

function statusOf(lease: (typeof leases)[number], today: string, reminderEnd: string): LeaseStatus {
  if (lease.storedStatus === 'terminated') return 'terminated'
  if (lease.longTerm) return 'active'
  if (lease.endDate < today) return 'expired'
  if (lease.endDate <= reminderEnd) return 'expiring'
  return 'active'
}

export async function fetchMyLeases(): Promise<MyLease[]> {
  return withLatency(() => {
    const uid = requireUid()
    const enterpriseIds = new Set(
      enterprises.filter((enterprise) => enterprise.contactUid === uid).map((enterprise) => enterprise.id),
    )
    const now = mockNowDate()
    const today = formatMockDate(now.getTime())
    const reminderEnd = addDays(now, LEASE_EXPIRE_REMIND_DAYS)
    return leases
      .filter((lease) =>
        (lease.renterType === 'individual' && lease.renterId === uid)
        || (lease.renterType === 'enterprise' && enterpriseIds.has(lease.renterId)),
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))
      .map((lease) => ({
        id: lease.id,
        renterType: lease.renterType as 'individual' | 'enterprise',
        renterName: lease.renterName,
        workstationLabels: [...lease.workstationLabels].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })),
        startDate: lease.startDate,
        endDate: lease.endDate,
        longTerm: lease.longTerm,
        status: statusOf(lease, today, reminderEnd),
        monthlyRent: lease.monthlyRent,
        rentPeriod: lease.rentPeriod,
        contactName: lease.contactName,
        contactPhone: lease.contactPhone,
      }))
  }, 160)
}
