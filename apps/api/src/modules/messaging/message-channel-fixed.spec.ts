import { MessageChannelService } from './message-channel.service'

describe('fixed notification settings', () => {
  const payload = { kind: 'sms', provider: 'aliyun_sms', name: '短信通知', enabled: true,
    config: { signName: '测试签名', templateMapping: { verify_code: 'SMS_1' } },
    credentialMode: 'inline', credentialEnv: {}, dailyLimit: 0 }
  function fixture(rows: Record<string, unknown>[]) {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1), messageChannel: {
      findMany: jest.fn().mockImplementation(async () => rows),
      findUnique: jest.fn().mockImplementation(async ({ where }) => rows.find(row => where.id ? row.id === where.id : row.provider === where.kind_provider.provider) ?? null),
      update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } }
    const prisma = { $transaction: jest.fn().mockImplementation(async action => action(tx)) }
    const audit = { record: jest.fn().mockResolvedValue(undefined) }
    const ids = { next: jest.fn().mockResolvedValue('MC-new') }
    return { tx, prisma, service: new MessageChannelService(prisma as never, ids as never, audit as never, {} as never, {} as never) }
  }
  it('updates the matching historical provider and disables all other records atomically', async () => {
    const { tx, prisma, service } = fixture([
      { id: 'old', provider: 'tencent_sms', kind: 'sms', enabled: true, credentialMode: 'inline', credentialEnv: { secretId: 'old' } },
      { id: 'target', provider: 'aliyun_sms', kind: 'sms', enabled: false, credentialMode: 'inline', credentialEnv: { accessKeyId: 'existing', accessKeySecret: 'existing' } },
    ])
    expect(await service.saveFixed('sms', payload, 'operator')).toEqual({ id: 'target' })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.messageChannel.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'target' }, data: expect.objectContaining({ credentialEnv: { accessKeyId: 'existing', accessKeySecret: 'existing' } }) }))
    expect(tx.messageChannel.create).not.toHaveBeenCalled()
    expect(tx.messageChannel.updateMany).toHaveBeenCalledWith({ where: { kind: 'sms', id: { not: 'target' } }, data: expect.objectContaining({ enabled: false }) })
  })
  it('switches an existing slot without carrying credentials from a different provider', async () => {
    const { tx, service } = fixture([{ id: 'slot', kind: 'sms', provider: 'tencent_sms', enabled: true,
      credentialMode: 'inline', credentialEnv: { secretId: 'old', secretKey: 'old-secret' } }])
    await service.saveFixed('sms', payload, 'operator')
    expect(tx.messageChannel.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'slot' }, data: expect.objectContaining({ provider: 'aliyun_sms', credentialEnv: {} }) }))
    expect(tx.messageChannel.create).not.toHaveBeenCalled()
  })
  it('creates the fixed slot once when not yet configured', async () => {
    const { tx, service } = fixture([])
    await expect(service.saveFixed('sms', payload, 'operator')).resolves.toEqual({ id: 'MC-new' })
    expect(tx.messageChannel.create).toHaveBeenCalledTimes(1)
  })
  it('rejects mismatched types and unsupported providers before opening a transaction', async () => {
    const { prisma, service } = fixture([])
    await expect(service.saveFixed('email', payload, 'operator')).rejects.toThrow('通知类型')
    await expect(service.saveFixed('sms', { ...payload, provider: 'smtp' }, 'operator')).rejects.toThrow('供应商')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it('does not deactivate the current provider when validating the replacement fails', async () => {
    const { tx, service } = fixture([{ id: 'slot', kind: 'sms', provider: 'tencent_sms', enabled: true }])
    await expect(service.saveFixed('sms', { ...payload, config: {} }, 'operator')).rejects.toThrow('短信签名')
    expect(tx.messageChannel.update).not.toHaveBeenCalled()
    expect(tx.messageChannel.updateMany).not.toHaveBeenCalled()
  })
})
