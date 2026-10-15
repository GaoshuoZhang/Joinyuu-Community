import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { StorageService } from '../../common/storage/storage.service'
import { AuditService } from '../../common/audit/audit.service'
import { imageMime, readThemeZip, safeAssetPath, validateManifest } from './theme-package'

@Injectable()
export class MobileThemeService {
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
    if (action === 'activate') await this.load(id ?? '')
    // CAS protects the previous-version pointer when two administrators switch concurrently.
    const state = await this.prisma.mobileThemeState.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    const activeId = action === 'reset' ? null : action === 'rollback' ? state.previousId : id!
    if (activeId) await this.load(activeId)
    if (activeId === state.activeId) return { activeId }
    const result = await this.prisma.mobileThemeState.updateMany({ where: { id: 1, revision: state.revision },
      data: { activeId, previousId: state.activeId, revision: { increment: 1 } } })
    if (!result.count) throw new ConflictException('主题状态已变化，请重新加载后操作')
    await this.audit.record({ module: '系统管理', action: action === 'activate' ? '启用移动端主题' : action === 'reset' ? '恢复公版主题' : '回退移动端主题',
      target: activeId ?? '公版', operator, before: { activeId: state.activeId }, after: { activeId } })
    return { activeId }
  }

  async preview(id: string) {
    await this.load(id)
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    await this.prisma.mobileThemePreview.deleteMany({ where: { expiresAt: { lt: new Date() } } })
    await this.prisma.mobileThemePreview.create({ data: { tokenHash: this.hash(token), packageId: id, expiresAt } })
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
  private async load(id: string) {
    const row = await this.prisma.mobileThemePackage.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('主题包不存在')
    validateManifest(row.manifest)
    return row
  }
}
