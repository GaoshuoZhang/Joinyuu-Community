import { ConflictException } from '@nestjs/common'
import { MessageChannelService } from './messaging/message-channel.service'
import { MessageTemplateService } from './messaging/message-template.service'
import { MessageRenderService } from './messaging/message-render.service'
import { validateEventTimes } from './events/event-time'
import { SpacesService } from './spaces/spaces.service'
import { ContentsService } from './contents/contents.service'
import { EventsService } from './events/events.service'
import { ExternalEnterprisesService } from './external-enterprises/external-enterprises.service'

describe('UI reliability contracts', () => {
  it('duplicate external enterprise creation cannot merge unrelated member identities by name', async () => {
    const prisma = { externalEnterpriseProfile: { findFirst: jest.fn().mockResolvedValue({ id: 'XE1' }), create: jest.fn() } }
    const ids = { next: jest.fn() }
    const service = new ExternalEnterprisesService(prisma as never, ids as never, {} as never)
    await expect(service.create({ name: '  已有档案  ', industry: '科技' })).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.externalEnterpriseProfile.findFirst).toHaveBeenCalledWith({ where: { name: '已有档案', deletedAt: null } })
    expect(prisma.externalEnterpriseProfile.create).not.toHaveBeenCalled()
    expect(ids.next).not.toHaveBeenCalled()
  })

  it('rescheduling validates real dates and the existing enrollment deadline before writing or notifying', async () => {
    const prisma = { communityEvent: { findUnique: jest.fn().mockResolvedValue({ status: 'published', enrollmentDeadline: '2026-10-15 09:00' }) },
      eventEnrollment: { findMany: jest.fn() }, $transaction: jest.fn() }
    const service = new EventsService(prisma as never, {} as never, {} as never, {} as never, {} as never)
    for (const startTime of ['2026-02-30 10:00', '2026-10-15 08:00']) {
      await expect(service.reschedule('EV1', { startTime, endTime: '2026-10-15 11:00', reason: '调整时间' }, 'operator')).rejects.toThrow()
    }
    expect(prisma.eventEnrollment.findMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it('creating an existing channel rejects without mutating configuration or credentials', async () => {
    const prisma = { messageChannel: { findUnique: jest.fn().mockResolvedValue({ id: 'MC1', kind: 'inapp', provider: 'inapp' }),
      create: jest.fn(), update: jest.fn() } }
    const service = new MessageChannelService(prisma as never, {} as never, {} as never, {} as never, {} as never)
    await expect(service.upsert({ kind: 'inapp', provider: 'inapp', name: '新渠道', enabled: false,
      dailyLimit: 0, config: {}, credentialMode: 'inline', credentialEnv: {} }, 'operator')).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.messageChannel.update).not.toHaveBeenCalled()
    expect(prisma.messageChannel.create).not.toHaveBeenCalled()
  })

  it('an explicit channel edit updates only its matching ID', async () => {
    const prisma = { messageChannel: { findUnique: jest.fn().mockResolvedValue({ id: 'MC1', kind: 'inapp', provider: 'inapp',
      credentialMode: 'inline', credentialEnv: {} }), update: jest.fn().mockResolvedValue({}), create: jest.fn() } }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const service = new MessageChannelService(prisma as never, {} as never, audit as never, {} as never, {} as never)
    const result = await service.upsert({ kind: 'inapp', provider: 'inapp', name: '编辑名称', enabled: true,
      dailyLimit: 0, config: {}, credentialMode: 'inline', credentialEnv: {} }, 'operator', 'MC1')
    expect(result.id).toBe('MC1')
    expect(prisma.messageChannel.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'MC1' } }))
    expect(prisma.messageChannel.create).not.toHaveBeenCalled()
  })

  it('preview renders current unsaved text and its variable whitelist without reading a published version or writing', async () => {
    const prisma = { messageTemplate: { findUnique: jest.fn().mockResolvedValue({ variables: ['old'] }) },
      messageTemplateVersion: { findFirst: jest.fn(), create: jest.fn() } }
    const service = new MessageTemplateService(prisma as never, {} as never, {} as never, new MessageRenderService(), {} as never, {} as never)
    const result = await service.preview('MT1', { variables: { name: '新用户' }, draft: {
      subject: '你好 {{name}}', body: '当前编辑正文 {{name}}', variables: ['name'],
    } })
    expect(result).toEqual({ subject: '你好 新用户', body: '当前编辑正文 新用户' })
    expect(prisma.messageTemplateVersion.findFirst).not.toHaveBeenCalled()
    expect(prisma.messageTemplateVersion.create).not.toHaveBeenCalled()
    await expect(service.preview('MT1', { draft: { body: '{{unknown}}', variables: [] } })).rejects.toThrow('未在白名单')
  })

  it('rejects reversed, impossible and inconsistent event times', () => {
    expect(() => validateEventTimes({ startTime: '2026-10-15 10:00', endTime: '2026-10-15 11:00', enrollmentDeadline: '2026-10-15 10:00' })).not.toThrow()
    for (const payload of [
      { startTime: '2026-10-15 10:00', endTime: '2026-10-15 10:00' },
      { startTime: '2026-02-30 10:00', endTime: '2026-03-01 11:00' },
      { startTime: '2026-10-15 10:00', endTime: '2026-10-15 11:00', enrollmentDeadline: '2026-10-15 10:01' },
    ]) expect(() => validateEventTimes(payload)).toThrow()
  })

  it('applies derived reservation states before pagination and counts with the same conditions', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 15, 10, 30))
    try {
      const prisma = { spaceReservation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(37) } }
      const service = new SpacesService(prisma as never, {} as never, {} as never)
      for (const status of ['approved', 'using', 'ended']) {
        const result = await service.findReservations({ page: 3, pageSize: 10, status, keyword: '甲', spaceId: 'S1' })
        const args = prisma.spaceReservation.findMany.mock.calls.at(-1)![0]
        expect(args.skip).toBe(20)
        expect(args.where.status).toBe('approved')
        expect(args.where.spaceId).toBe('S1')
        expect(args.where.AND).toHaveLength(1)
        expect(args.where.OR).toBeDefined()
        expect(prisma.spaceReservation.count).toHaveBeenLastCalledWith({ where: args.where })
        expect(result.total).toBe(37)
      }
    } finally { jest.useRealTimers() }
  })

  it('reading statistics aggregate all published history and paginate the ranking in the database', async () => {
    const prisma = { article: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 6001 }, _sum: { views: 12002 }, _max: { views: 400 } }),
      findMany: jest.fn().mockResolvedValue([]),
    } }
    const service = new ContentsService(prisma as never, {} as never, {} as never, {} as never, {} as never)
    const result = await service.readStats({ page: 2, pageSize: 20 })
    expect(result.total).toBe(6001)
    expect(result.summary).toEqual({ articleCount: 6001, totalViews: 12002, averageViews: 2, topViews: 400 })
    expect(prisma.article.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, publishedAt: { not: null } }, skip: 20, take: 20,
    }))
  })
})
