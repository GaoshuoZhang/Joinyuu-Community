import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Lease, LeaseWorkstation, Workstation } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { addDays, formatToday } from '../../../common/utils/time'

type LeaseWithWorkstations = Lease & {
  workstations: Array<LeaseWorkstation & { workstation: Workstation }>
}

export type AppLeaseStatus = 'active' | 'terminated' | 'expired' | 'expiring'

export interface AppLeaseDto {
  id: string
  renterType: 'individual' | 'enterprise'
  renterName: string
  workstationLabels: string[]
  startDate: string
  endDate: string
  longTerm: boolean
  status: AppLeaseStatus
  monthlyRent: number
  rentPeriod: string
  contactName: string
  contactPhone: string
}

function leaseStatus(lease: Lease, today: string, reminderEnd: string): AppLeaseStatus {
  if (lease.status === 'terminated') return 'terminated'
  if (lease.longTerm) return 'active'
  if (lease.endDate < today) return 'expired'
  if (lease.endDate <= reminderEnd) return 'expiring'
  return 'active'
}

function toAppLease(lease: LeaseWithWorkstations, today: string, reminderEnd: string): AppLeaseDto {
  return {
    id: lease.id,
    renterType: lease.renterType as 'individual' | 'enterprise',
    renterName: lease.renterName,
    workstationLabels: lease.workstations
      .map(({ workstation }) => workstation.seatNo)
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })),
    startDate: lease.startDate,
    endDate: lease.endDate,
    longTerm: lease.longTerm,
    status: leaseStatus(lease, today, reminderEnd),
    monthlyRent: lease.monthlyRent,
    rentPeriod: lease.rentPeriod,
    contactName: lease.contactName,
    contactPhone: lease.contactPhone,
  }
}

@Injectable()
export class AppLeasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(uid: string): Promise<AppLeaseDto[]> {
    const { leases, reminderDays } = await this.prisma.$transaction(async (tx) => {
      const enterprises = await tx.enterprise.findMany({
        where: { contactUserId: uid },
        select: { id: true },
      })
      const config = await tx.systemConfig.findUnique({
        where: { id: 1 },
        select: { leaseExpireRemindDays: true },
      })
      const enterpriseIds = enterprises.map(({ id }) => id)
      const access = [
        { renterType: 'individual', renterId: uid },
        ...(enterpriseIds.length ? [{ renterType: 'enterprise', renterId: { in: enterpriseIds } }] : []),
      ]
      const rows = await tx.lease.findMany({
        where: { OR: access },
        include: { workstations: { include: { workstation: true } } },
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      })
      return { leases: rows, reminderDays: Math.max(0, config?.leaseExpireRemindDays ?? 15) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    const today = formatToday()
    const reminderEnd = addDays(today, reminderDays)
    return leases.map((lease) => toAppLease(lease, today, reminderEnd))
  }
}
