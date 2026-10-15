import { MobileThemeService } from './mobile-theme.service'
import type { PrismaService } from '../../common/prisma/prisma.service'
import type { StorageService } from '../../common/storage/storage.service'
import type { AuditService } from '../../common/audit/audit.service'

describe('mobile theme lifecycle', () => {
  const row = { id: 'package-a', manifest: { schemaVersion: 1, id: 'customer-a', name: '客户 A', version: '1.0.0', brand: { logo: 'assets/logo.png' } } }
  let db: {
    mobileThemePackage: { findUnique: jest.Mock }
    mobileThemeState: { findUnique: jest.Mock; upsert: jest.Mock; updateMany: jest.Mock }
    mobileThemePreview: { findUnique: jest.Mock; create: jest.Mock; deleteMany: jest.Mock }
  }
  let audit: { record: jest.Mock }
  let service: MobileThemeService
  beforeEach(() => {
    db = {
      mobileThemePackage: { findUnique: jest.fn().mockResolvedValue(row) },
      mobileThemeState: { findUnique: jest.fn().mockResolvedValue({ activeId: null }), upsert: jest.fn().mockResolvedValue({ activeId: 'old', previousId: null, revision: 1 }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      mobileThemePreview: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    }
    audit = { record: jest.fn() }
    service = new MobileThemeService(db as unknown as PrismaService, {} as StorageService, audit as unknown as AuditService)
  })
  it('returns public UI by default and only exposes the active package', async () => {
    expect(await service.current()).toBeNull()
    expect(db.mobileThemePackage.findUnique).not.toHaveBeenCalled()
    db.mobileThemeState.findUnique.mockResolvedValue({ activeId: row.id })
    expect(await service.current()).toMatchObject({ packageId: row.id, brand: { logo: `/api/public/mobile-themes/${row.id}/assets/logo.png` } })
  })
  it('does not switch active state when generating preview grants', async () => {
    const grant = await service.preview(row.id)
    expect(grant.token).toMatch(/^[a-f0-9]{64}$/)
    expect(db.mobileThemePreview.create.mock.calls[0][0].data.tokenHash).not.toBe(grant.token)
    expect(db.mobileThemeState.updateMany).not.toHaveBeenCalled()
  })
  it('rejects expired preview grants', async () => {
    db.mobileThemePreview.findUnique.mockResolvedValue({ packageId: row.id, expiresAt: new Date(0) })
    await expect(service.current('a'.repeat(64))).rejects.toThrow('过期')
  })
  it('records previous version and protects concurrent switches', async () => {
    await service.change('activate', row.id, '管理员')
    expect(db.mobileThemeState.updateMany).toHaveBeenCalledWith({ where: { id: 1, revision: 1 }, data: { activeId: row.id, previousId: 'old', revision: { increment: 1 } } })
    expect(audit.record).toHaveBeenCalled()
    db.mobileThemeState.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.change('reset', undefined, '管理员')).rejects.toThrow('状态已变化')
  })
  it('can roll back to the public UI', async () => {
    expect(await service.change('rollback', undefined, '管理员')).toEqual({ activeId: null })
  })
})
