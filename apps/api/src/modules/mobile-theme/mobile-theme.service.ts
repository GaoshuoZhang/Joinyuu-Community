import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { StorageService } from '../../common/storage/storage.service'
import { AuditService } from '../../common/audit/audit.service'
import { imageMime, readThemeZip, safeAssetPath, validateManifest } from './theme-package'

@Injectable()
export class MobileThemeService {
  private readonly logger = new Logger(MobileThemeService.name)
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService) {}

  async list() {
    const [state, rows] = await Promise.all([
      this.prisma.mobileThemeState.findUnique({ where: { id: 1 } }),
      this.prisma.mobileThemePackage.findMany({ orderBy: { createdAt: 'desc' } }),
    ])
    return { activeId: state?.activeId ?? null, previousId: state?.previousId ?? null, schemaVersion: 1,
      packages: rows.map((row) => ({ id: row.id, manifest: row.manifest, checksum: row.checksum, createdAt: row.createdAt.toISOString(), createdBy: row.createdBy })) }
  }

  async upload(file: { buffer: Buffer } | undefined, operator: string) {
    if (!file?.buffer) throw new BadRequestException('请选择主题 ZIP 文件')
    const { manifest, assets } = await readThemeZip(file.buffer)
    const checksum = createHash('sha256').update(file.buffer).digest('hex')
    const existing = await this.prisma.mobileThemePackage.findUnique({ where: { checksum } })
    if (existing) throw new ConflictException('此主题包已上传，请在列表中预览或启用')
    const id = randomUUID()
    const stored: Record<string, string> = {}
    try {
      for (const [path, buffer] of assets) {
        const key = `mobile-themes/${id}/${path}`
        await this.storage.put(key, buffer, imageMime(path, buffer)!)
        stored[path] = key
      }
      await this.prisma.mobileThemePackage.create({ data: { id, themeId: manifest.id, version: manifest.version,
        manifest: manifest as unknown as Prisma.InputJsonObject, assets: stored, checksum, createdBy: operator } })
    } catch (error) {
      await Promise.allSettled(Object.values(stored).map((key) => this.storage.remove(key)))
      throw error
    }
    await this.audit.record({ module: '系统管理', action: '上传移动端主题', target: `${manifest.name} ${manifest.version}`, operator })
    return { id }
  }

  async change(action: 'activate' | 'reset' | 'rollback', id: string | undefined, operator: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // All switches, deletions and preview grants lock the same singleton row.
      // Validating the target while holding this lock prevents activate/delete races.
      const state = await this.lockState(tx)
      const activeId = action === 'reset' ? null : action === 'rollback' ? state.previousId : id!
      if (activeId) await this.load(activeId, tx)
      if (activeId === state.activeId) return { activeId, before: state.activeId, changed: false }
      await tx.mobileThemeState.update({ where: { id: 1 }, data: { activeId, previousId: state.activeId, revision: { increment: 1 } } })
      return { activeId, before: state.activeId, changed: true }
    })
    if (result.changed) await this.audit.record({ module: '系统管理', action: action === 'activate' ? '启用移动端主题' : action === 'reset' ? '恢复默认主题' : '回退移动端主题',
      target: result.activeId ?? '默认主题', operator, before: { activeId: result.before }, after: { activeId: result.activeId } })
    return { activeId: result.activeId }
  }

  async remove(id: string, operator: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      const state = await this.lockState(tx)
      const row = await this.load(id, tx)
      if (state.activeId === id) throw new ConflictException('当前使用的主题不能删除，请先切换主题或恢复默认')
      await tx.mobileThemeState.update({ where: { id: 1 }, data: { previousId: state.previousId === id ? null : state.previousId, revision: { increment: 1 } } })
      await tx.mobileThemePreview.deleteMany({ where: { packageId: id } })
      await tx.mobileThemePackage.delete({ where: { id } })
      return row
    })
    const manifest = validateManifest(row.manifest)
    await this.audit.record({ module: '系统管理', action: '删除移动端主题', target: `${manifest.name} ${manifest.version}`, operator, before: { packageId: id } })
    const cleanup = await Promise.allSettled(Object.values(row.assets as Record<string, string>).map((key) => this.storage.remove(key)))
    if (cleanup.some((result) => result.status === 'rejected')) this.logger.warn(`主题 ${id} 已删除，部分存储资源清理失败，需重试清理`)
    return { id }
  }

  async preview(id: string) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await this.prisma.$transaction(async (tx) => {
      await this.lockState(tx)
      await this.load(id, tx)
      await tx.mobileThemePreview.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      await tx.mobileThemePreview.create({ data: { tokenHash: this.hash(token), packageId: id, expiresAt } })
    })
    return { token, expiresAt: expiresAt.toISOString() }
  }

  async current(preview?: string) {
    let id: string | null = null
    if (preview !== undefined) {
      if (!/^[a-f0-9]{64}$/.test(preview)) throw new NotFoundException('主题预览链接无效或已过期')
      const grant = await this.prisma.mobileThemePreview.findUnique({ where: { tokenHash: this.hash(preview) } })
      if (!grant || grant.expiresAt.getTime() <= Date.now()) throw new NotFoundException('主题预览链接无效或已过期')
      id = grant.packageId
    } else id = (await this.prisma.mobileThemeState.findUnique({ where: { id: 1 } }))?.activeId ?? null
    if (!id) return null
    const row = await this.load(id)
    const manifest = validateManifest(row.manifest)
    const brand = { ...manifest.brand }
    for (const field of ['logo', 'logoDark', 'homeBackground'] as const) if (brand[field]) brand[field] = `/api/public/mobile-themes/${id}/${brand[field]}`
    return { packageId: id, ...manifest, brand }
  }

  async asset(id: string, path: string) {
    if (!safeAssetPath(path)) throw new NotFoundException('主题资源不存在')
    const row = await this.load(id)
    const assets = row.assets as Record<string, string>
    const key = assets[path]
    if (!key) throw new NotFoundException('主题资源不存在')
    const buffer = await this.storage.read(key)
    const mime = buffer && imageMime(path, buffer)
    if (!buffer || !mime) throw new NotFoundException('主题资源不存在')
    return { buffer, mime }
  }

  private hash(token: string) { return createHash('sha256').update(token).digest('hex') }
  private lockState(tx: Prisma.TransactionClient) {
    return tx.mobileThemeState.upsert({ where: { id: 1 }, create: { id: 1 }, update: { revision: { increment: 0 } } })
  }
  private async load(id: string, db: Pick<PrismaService, 'mobileThemePackage'> = this.prisma) {
    const row = await db.mobileThemePackage.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('主题包不存在')
    validateManifest(row.manifest)
    return row
  }
}
