import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { IdGeneratorService } from '../id-generator/id-generator.service'
import { formatNow } from '../utils/time'
import { evaluateLicense, LICENSE_MAX_BYTES, PRODUCT_ID } from './license-format'
import { getTrustedLicenseKeys } from './trusted-keys'

@Injectable()
export class LicenseService {
  constructor(private readonly prisma: PrismaService, private readonly ids: IdGeneratorService) {}

  private async installation() {
    const existing = await this.prisma.deploymentLicense.findUnique({ where: { id: 'default' } })
    if (existing) return existing
    // Concurrent first requests/replicas must converge on the same installation.
    await this.prisma.deploymentLicense.createMany({ data: [{ id: 'default', deploymentId: randomUUID() }], skipDuplicates: true })
    return this.prisma.deploymentLicense.findUniqueOrThrow({ where: { id: 'default' } })
  }

  async status() {
    const row = await this.installation()
    const result = row.document === null
      ? { status: 'invalid' as const, reason: '尚未导入许可证', license: null }
      : evaluateLicense(row.document, row.deploymentId, getTrustedLicenseKeys())
    return { ...result, deploymentId: row.deploymentId, productId: PRODUCT_ID, importedAt: row.importedAt?.toISOString() ?? null, serverTime: new Date().toISOString() }
  }

  async canWrite(): Promise<boolean> { return (await this.status()).status === 'valid' }

  async assertWritable(): Promise<void> {
    const result = await this.status()
    if (result.status !== 'valid') throw new ForbiddenException(`${result.status === 'expired' ? '许可证已到期' : '许可证无效'}，当前仅允许查询、导出、备份和许可证管理`)
  }

  async request(customerName: string) {
    if (!customerName.trim()) throw new BadRequestException('请填写客户名称')
    const row = await this.installation()
    return { version: 1, productId: PRODUCT_ID, deploymentId: row.deploymentId, customerName: customerName.trim(), requestedAt: new Date().toISOString() }
  }

  async importFile(content: string, operator: string) {
    if (Buffer.byteLength(content, 'utf8') > LICENSE_MAX_BYTES) throw new BadRequestException('许可证文件不能超过 32 KB')
    let document: unknown
    try { document = JSON.parse(content) } catch { throw new BadRequestException('许可证文件不是有效的 JSON') }
    const row = await this.installation()
    const result = evaluateLicense(document, row.deploymentId, getTrustedLicenseKeys())
    if (result.status !== 'valid') throw new BadRequestException(result.reason)
    // Atomic replacement and audit: a rejected import never overwrites the existing document.
    await this.prisma.$transaction(async tx => {
      await tx.deploymentLicense.update({ where: { id: 'default' }, data: { document: document as Prisma.InputJsonValue, importedAt: new Date() } })
      await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '许可证管理', action: '导入许可证', target: result.license!.licenseId,
        operator, at: formatNow(), detail: `客户：${result.license!.customerName}；有效期至：${result.license!.expiresAt ?? '永久'}` } })
    })
    return this.status()
  }
}
