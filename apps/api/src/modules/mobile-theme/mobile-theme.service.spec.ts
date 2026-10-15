import { MobileThemeService } from './mobile-theme.service'
import type { PrismaService } from '../../common/prisma/prisma.service'
import type { StorageService } from '../../common/storage/storage.service'
import type { AuditService } from '../../common/audit/audit.service'

describe('mobile theme lifecycle', () => {
  const row = { id: 'package-a', assets: { 'assets/logo.png': 'mobile-themes/package-a/assets/logo.png' }, manifest: { schemaVersion: 1, id: 'customer-a', name: '客户 A', version: '1.0.0', brand: { logo: 'assets/logo.png' } } }
  let db: {
    mobileThemePackage: { findUnique: jest.Mock; delete: jest.Mock }
    mobileThemeState: { findUnique: jest.Mock; upsert: jest.Mock; update: jest.Mock }
    mobileThemePreview: { findUnique: jest.Mock; create: jest.Mock; deleteMany: jest.Mock }
  }
  let storage: { remove: jest.Mock }
  let audit: { record: jest.Mock }
  let service: MobileThemeService
  beforeEach(() => {
    db = {
      mobileThemePackage: { findUnique: jest.fn().mockResolvedValue(row), delete: jest.fn().mockResolvedValue(row) },
      mobileThemeState: { findUnique: jest.fn().mockResolvedValue({ activeId: null }), upsert: jest.fn().mockResolvedValue({ activeId: 'old', previousId: null, revision: 1 }), update: jest.fn() },
      mobileThemePreview: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    }
    Object.assign(db, { $transaction: jest.fn(async (action) => action(db)) })
    storage = { remove: jest.fn().mockResolvedValue(undefined) }
    audit = { record: jest.fn() }
    service = new MobileThemeService(db as unknown as PrismaService, storage as unknown as StorageService, audit as unknown as AuditService)
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
    expect(db.mobileThemeState.update).not.toHaveBeenCalled()
  })
  it('rewrites dark logo assets to public versioned URLs', async () => {
    db.mobileThemeState.findUnique.mockResolvedValue({ activeId: row.id })
    db.mobileThemePackage.findUnique.mockResolvedValue({ ...row, manifest: { ...row.manifest, brand: { logo: 'assets/logo.png', logoDark: 'assets/dark.png' } } })
    expect(await service.current()).toMatchObject({ brand: { logoDark: `/api/public/mobile-themes/${row.id}/assets/dark.png` } })
  })
  it('rejects expired preview grants', async () => {
    db.mobileThemePreview.findUnique.mockResolvedValue({ packageId: row.id, expiresAt: new Date(0) })
    await expect(service.current('a'.repeat(64))).rejects.toThrow('过期')
  })
  it('locks switches and records previous version', async () => {
    await service.change('activate', row.id, '管理员')
    expect(db.mobileThemeState.upsert).toHaveBeenCalledWith({ where: { id: 1 }, create: { id: 1 }, update: { revision: { increment: 0 } } })
    expect(db.mobileThemeState.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { activeId: row.id, previousId: 'old', revision: { increment: 1 } } })
    expect(audit.record).toHaveBeenCalled()
  })
  it('rejects deletion of the active theme before touching grants or storage', async () => {
    db.mobileThemeState.upsert.mockResolvedValue({ activeId: row.id })
    await expect(service.remove(row.id, '管理员')).rejects.toThrow('当前使用的主题不能删除')
    expect(db.mobileThemePackage.delete).not.toHaveBeenCalled()
    expect(db.mobileThemePreview.deleteMany).not.toHaveBeenCalled()
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('deletes history, revokes preview, clears previous pointer and removes assets', async () => {
    db.mobileThemeState.upsert.mockResolvedValue({ activeId: 'old', previousId: row.id })
    await expect(service.remove(row.id, '管理员')).resolves.toEqual({ id: row.id })
    expect(db.mobileThemeState.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { previousId: null, revision: { increment: 1 } } })
    expect(db.mobileThemePreview.deleteMany).toHaveBeenCalledWith({ where: { packageId: row.id } })
    expect(storage.remove).toHaveBeenCalledWith('mobile-themes/package-a/assets/logo.png')
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: '删除移动端主题' }))
  })
  it('can roll back to the public UI', async () => {
    expect(await service.change('rollback', undefined, '管理员')).toEqual({ activeId: null })
  })
})
