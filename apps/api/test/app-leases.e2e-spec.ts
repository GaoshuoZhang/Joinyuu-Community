import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { addDays, formatToday } from '../src/common/utils/time'
import { appGet, appLoginAs } from './helpers/app-login'
import { reseed } from './helpers/reseed'

describe('GET /api/app/me/leases', () => {
  let app: INestApplication
  let prisma: PrismaService
  let ownerToken: string
  let memberToken: string
  let individualToken: string

  const enterpriseLeaseIds = ['LSTESTE1', 'LSTESTE2', 'LSTESTE3', 'LSTESTE4', 'LSTESTE5', 'LSTESTE6']
  const individualLeaseId = 'LSTESTI1'
  const customLeaseId = 'LSTESTC1'

  beforeAll(async () => {
    reseed()
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    prisma = app.get(PrismaService)

    const today = formatToday()
    await prisma.systemConfig.update({ where: { id: 1 }, data: { leaseExpireRemindDays: 15 } })
    await prisma.lease.createMany({
      data: [
        {
          id: enterpriseLeaseIds[0], renterId: 'E2001', renterName: '星澜智能科技', renterType: 'enterprise',
          startDate: '2026-01-01', endDate: addDays(today, 15), longTerm: false, status: 'active', monthlyRent: 8000,
          rentPeriod: 'month', contactName: '租约联系人', contactPhone: '13900000001', note: '不得下发', editRecords: [{ operator: '管理员' }],
        },
        {
          id: enterpriseLeaseIds[1], renterId: 'E2001', renterName: '星澜智能科技', renterType: 'enterprise',
          startDate: '2025-01-01', endDate: addDays(today, -1), longTerm: false, status: 'active', monthlyRent: 7000,
          rentPeriod: 'month', contactName: '历史联系人', contactPhone: '13900000002', deletedAt: '2026-08-01 10:00', deletedBy: '管理员',
        },
        {
          id: enterpriseLeaseIds[2], renterId: 'E2001', renterName: '星澜智能科技', renterType: 'enterprise',
          startDate: '2024-01-01', endDate: addDays(today, 15), longTerm: false, status: 'terminated', monthlyRent: 6000,
          rentPeriod: 'year', contactName: '终止联系人', contactPhone: '13900000003', terminatedAt: '2026-07-01 09:00',
        },
        {
          id: enterpriseLeaseIds[3], renterId: 'E2001', renterName: '星澜智能科技', renterType: 'enterprise',
          startDate: '2026-02-01', endDate: '', longTerm: true, status: 'active', monthlyRent: 5000,
          rentPeriod: 'month', contactName: '长期联系人', contactPhone: '13900000004',
        },
        {
          id: enterpriseLeaseIds[4], renterId: 'E2001', renterName: '星澜智能科技', renterType: 'enterprise',
          startDate: '2026-03-01', endDate: addDays(today, 16), longTerm: false, status: 'active', monthlyRent: 4000,
          rentPeriod: 'week', contactName: '正常联系人', contactPhone: '13900000005',
        },
        {
          id: enterpriseLeaseIds[5], renterId: 'E2001', renterName: '星澜智能科技', renterType: 'enterprise',
          startDate: '2026-03-02', endDate: today, longTerm: false, status: 'active', monthlyRent: 3000,
          rentPeriod: 'day', contactName: '当日联系人', contactPhone: '13900000006',
        },
        {
          id: individualLeaseId, renterId: 'U1005', renterName: '顾北辰', renterType: 'individual',
          startDate: '2026-04-01', endDate: addDays(today, 3), longTerm: false, status: 'active', monthlyRent: 1000,
          rentPeriod: 'month', contactName: '顾北辰', contactPhone: '13801210005',
        },
        {
          id: customLeaseId, renterId: 'U1001', renterName: '自定义租户', renterType: 'custom',
          startDate: '2026-05-01', endDate: addDays(today, 3), longTerm: false, status: 'active', monthlyRent: 999,
          rentPeriod: 'month', contactName: '陈屿', contactPhone: '13801210001',
        },
      ],
    })
    await prisma.leaseWorkstation.createMany({
      data: [
        { leaseId: enterpriseLeaseIds[0], workstationId: 'WS1010' },
        { leaseId: enterpriseLeaseIds[0], workstationId: 'WS1009' },
      ],
    })

    ownerToken = await appLoginAs(app, '13801210001', 'user123')
    memberToken = await appLoginAs(app, '13801210002', 'user123')
    individualToken = await appLoginAs(app, '13801210005', 'user123')
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns only the current enterprise contact leases and safe DTO fields', async () => {
    const res = await appGet(app, ownerToken, '/api/app/me/leases')
    expect(res.status).toBe(200)
    const leases = res.body.data as Array<Record<string, unknown>>
    expect(leases.filter((lease) => enterpriseLeaseIds.includes(String(lease.id)))).toHaveLength(6)
    expect(leases.some((lease) => lease.id === customLeaseId)).toBe(false)

    const expiring = leases.find((lease) => lease.id === enterpriseLeaseIds[0])
    expect(expiring).toEqual({
      id: enterpriseLeaseIds[0], renterType: 'enterprise', renterName: '星澜智能科技',
      workstationLabels: ['A-09', 'A-10'], startDate: '2026-01-01', endDate: addDays(formatToday(), 15),
      longTerm: false, status: 'expiring', monthlyRent: 8000, rentPeriod: 'month',
      contactName: '租约联系人', contactPhone: '13900000001',
    })
    expect(expiring).not.toHaveProperty('note')
    expect(expiring).not.toHaveProperty('editRecords')
    expect(expiring).not.toHaveProperty('deletedAt')
    expect(expiring).not.toHaveProperty('deletedBy')
    expect(expiring).not.toHaveProperty('terminatedAt')
  })

  it('derives status with terminated and long-term precedence and inclusive reminder boundaries', async () => {
    const res = await appGet(app, ownerToken, '/api/app/me/leases')
    const statusById = Object.fromEntries(res.body.data.map((lease: { id: string; status: string }) => [lease.id, lease.status]))
    expect(statusById[enterpriseLeaseIds[0]]).toBe('expiring')
    expect(statusById[enterpriseLeaseIds[1]]).toBe('expired')
    expect(statusById[enterpriseLeaseIds[2]]).toBe('terminated')
    expect(statusById[enterpriseLeaseIds[3]]).toBe('active')
    expect(statusById[enterpriseLeaseIds[4]]).toBe('active')
    expect(statusById[enterpriseLeaseIds[5]]).toBe('expiring')
  })

  it('denies an ordinary enterprise member while preserving an individual owner lease', async () => {
    const member = await appGet(app, memberToken, '/api/app/me/leases')
    expect(member.status).toBe(200)
    expect(member.body.data.some((lease: { id: string }) => enterpriseLeaseIds.includes(lease.id))).toBe(false)

    const individual = await appGet(app, individualToken, '/api/app/me/leases')
    expect(individual.status).toBe(200)
    expect(individual.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: individualLeaseId, renterType: 'individual', status: 'expiring' }),
    ]))
  })

  it('follows the mutable current enterprise contact instead of JWT identity snapshots', async () => {
    await prisma.enterprise.update({ where: { id: 'E2001' }, data: { contactUserId: 'U1002' } })
    const previous = await appGet(app, ownerToken, '/api/app/me/leases')
    const current = await appGet(app, memberToken, '/api/app/me/leases')
    expect(previous.body.data.some((lease: { id: string }) => enterpriseLeaseIds.includes(lease.id))).toBe(false)
    expect(current.body.data.filter((lease: { id: string }) => enterpriseLeaseIds.includes(lease.id))).toHaveLength(6)
  })

  it('requires an authenticated app session', async () => {
    const res = await request(app.getHttpServer()).get('/api/app/me/leases')
    expect(res.status).toBe(401)
  })
})
