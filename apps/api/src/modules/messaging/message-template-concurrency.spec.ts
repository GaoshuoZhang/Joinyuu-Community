import { MessageTemplateService } from './message-template.service'
import { MessageRenderService } from './message-render.service'

describe('notification template version serialization', () => {
  function fixture() {
    const steps: string[] = []
    const tx = {
      $queryRaw: jest.fn().mockImplementation(async () => { steps.push('lock'); return [{ id: 'MT1' }] }),
      messageTemplateVersion: {
        findFirst: jest.fn().mockImplementation(async () => { steps.push('read-version'); return null }),
        create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      }, messageTemplate: { update: jest.fn().mockResolvedValue({}) },
    }
    const prisma = { $transaction: jest.fn().mockImplementation(async action => action(tx)), messageTemplate: {
      findUnique: jest.fn().mockResolvedValue({ id: 'MT1', code: 'notice', name: '通知', currentVersion: 1 }),
    } }
    const ids = { next: jest.fn().mockResolvedValue('MV2') }
    const service = new MessageTemplateService(prisma as never, ids as never, { record: jest.fn() } as never, new MessageRenderService(), {} as never, {} as never)
    return { service, tx, steps, ids }
  }
  it('locks the parent before reading or allocating the next version', async () => {
    const { service, tx, steps, ids } = fixture()
    tx.messageTemplateVersion.findFirst.mockImplementationOnce(async () => { steps.push('read-published'); return null })
      .mockImplementationOnce(async () => { steps.push('read-max'); return { version: 3 } })
    await expect(service.saveDraft('MT1', { name: '通知', body: '正文', variables: [], category: 'security' }, 'operator')).resolves.toEqual({ version: 4 })
    expect(steps).toEqual(['lock', 'read-published', 'read-max'])
    expect(ids.next).toHaveBeenCalledWith('MV', tx)
    expect(tx.messageTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ templateId: 'MT1', version: 4 }) }))
  })
  it('validates and publishes the target under the same parent lock', async () => {
    const { service, tx, steps } = fixture()
    tx.messageTemplateVersion.findFirst.mockImplementation(async () => { steps.push('read-version'); return { id: 'MV1', version: 1, status: 'archived' } })
    await expect(service.publish('MT1', { version: 1 }, 'operator')).resolves.toEqual({ version: 1 })
    expect(steps).toEqual(['lock', 'read-version'])
    expect(tx.messageTemplateVersion.updateMany).toHaveBeenCalledWith({ where: { templateId: 'MT1', status: 'published' }, data: { status: 'archived' } })
  })
  it('uses the same lock when disabling a template', async () => {
    const { service, steps, tx } = fixture()
    await service.disable('MT1', 'operator')
    expect(steps).toEqual(['lock'])
    expect(tx.messageTemplate.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'draft' }) }))
  })
})
