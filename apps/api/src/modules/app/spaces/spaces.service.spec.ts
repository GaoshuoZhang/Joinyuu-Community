import type { PrismaService } from '../../../common/prisma/prisma.service'
import type { IdGeneratorService } from '../../../common/id-generator/id-generator.service'
import type { NotificationService } from '../../../common/notify/notification.service'
import { AppSpacesService } from './spaces.service'

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
          openHours: [{ start: '09:00', end: '12:00' }],
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
    )

    await expect(service.availability('S1001', '2026-10-10')).resolves.toEqual([
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
