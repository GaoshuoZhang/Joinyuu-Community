import type { Request } from 'express'
import type { JwtService } from '@nestjs/jwt'
import type { PrismaService } from '../../../common/prisma/prisma.service'
import type { RedisService } from '../../../common/redis/redis.service'
import type { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import type { NotificationService } from '../../../common/notify/notification.service'
import { AppSpacesService } from './spaces.service'

/** 游客请求（无 Authorization）：可见范围判定按空身份集处理 */
const guestReq = { headers: {} } as unknown as Request

describe('AppSpacesService availability', () => {
  it('marks pending and approved reservations unavailable', async () => {
    const prisma = {
      space: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'S1001',
          name: '测试会议室',
          location: '1F',
          openTime: '09:00',
          closeTime: '12:00',
          /* 可见范围两数组（空 = 不限）：游客也可访问 */
          visibilityIdentities: [],
          visibilityLevels: [],
        }),
      },
      spaceReservation: {
        findMany: jest.fn().mockResolvedValue([
          { startTime: '09:00', endTime: '10:00', status: 'pending' },
          { startTime: '10:00', endTime: '11:00', status: 'approved' },
        ]),
      },
      communityEvent: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const service = new AppSpacesService(
      prisma as unknown as PrismaService,
      {} as IdGeneratorService,
      {} as NotificationService,
      {} as JwtService,
      {} as RedisService,
    )

    await expect(service.availability('S1001', '2026-10-10', guestReq)).resolves.toEqual([
      { start: '09:00', end: '10:00', occupied: true, type: 'reservation' },
      { start: '10:00', end: '11:00', occupied: true, type: 'reservation' },
      { start: '11:00', end: '12:00', occupied: false },
    ])
    expect(prisma.spaceReservation.findMany).toHaveBeenCalledWith({
      where: {
        spaceId: 'S1001',
        date: '2026-10-10',
        status: { in: ['pending', 'approved'] },
        deletedAt: null,
      },
    })
  })
})

/** 我的预约展示状态：已通过且已过结束时间 → ended（已完成） */
describe('AppSpacesService reservation status derivation', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'SR1',
    spaceId: 'S1001',
    spaceName: '测试会议室',
    date: '2026-01-01',
    startTime: '09:00',
    endTime: '10:00',
    status: 'approved',
    submittedAt: '2026-01-01 08:00',
    identityType: null,
    subjectName: null,
    rejectReason: null,
    ...over,
  })

  function serviceFor(rows: unknown[]): AppSpacesService {
    const prisma = { spaceReservation: { findMany: jest.fn().mockResolvedValue(rows) } }
    return new AppSpacesService(
      prisma as unknown as PrismaService,
      {} as IdGeneratorService,
      {} as NotificationService,
      {} as JwtService,
      {} as RedisService,
    )
  }

  it('derives ended only for approved reservations past their end time', async () => {
    const list = await serviceFor([
      row({ id: 'past', date: '2020-01-01' }),
      row({ id: 'future', date: '2999-01-01' }),
      row({ id: 'pending', status: 'pending', date: '2020-01-01' }),
    ]).myReservations('U1001')

    expect(list.map((item) => [item.id, item.status])).toEqual([
      ['past', 'ended'],
      ['future', 'approved'],
      ['pending', 'pending'],
    ])
  })

  it('keeps cancelled and rejected reservations as-is', async () => {
    const list = await serviceFor([
      row({ id: 'cancelled', status: 'cancelled', date: '2020-01-01' }),
      row({ id: 'rejected', status: 'rejected', date: '2020-01-01' }),
    ]).myReservations('U1001')
    expect(list.map((item) => item.status)).toEqual(['cancelled', 'rejected'])
  })
})

/** 已结束的预约不可再取消（服务端兜底，避免仅靠客户端隐藏按钮） */
describe('AppSpacesService reservation cancel guard', () => {
  function serviceWith(prisma: Record<string, unknown>): AppSpacesService {
    return new AppSpacesService(
      prisma as unknown as PrismaService,
      {} as IdGeneratorService,
      {} as NotificationService,
      {} as JwtService,
      {} as RedisService,
    )
  }

  it('rejects cancelling an approved reservation that already ended', async () => {
    const prisma = {
      spaceReservation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'SR1',
          userId: 'U1001',
          spaceName: '测试会议室',
          date: '2020-01-01',
          startTime: '09:00',
          endTime: '10:00',
          status: 'approved',
          deletedAt: null,
          records: [],
          feePoints: 0,
        }),
      },
      $transaction: jest.fn(),
    }

    await expect(serviceWith(prisma).cancel('U1001', 'SR1')).rejects.toThrow('预约已结束')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
