import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import 'reflect-metadata'
import { PERMISSION_KEY } from '../decorators/require-permission.decorator'
import { PrismaService } from '../prisma/prisma.service'

/* 权限码目录校验：启动时扫描全部控制器（类级 + 方法级）的 @RequirePermission 元数据，
 * 与 AdminPermission 目录表比对；存在未登记权限码时记录 error 并 fail fast，
 * 避免装饰器写入错误码后运行期静默 403。 */
@Injectable()
export class PermissionCatalogValidatorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionCatalogValidatorService.name)

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const catalogRows = await this.prisma.adminPermission.findMany({ select: { code: true } })
    const catalog = new Set(catalogRows.map((row) => row.code))
    const unknown = new Map<string, string[]>()

    const controllers = this.discovery.getControllers()
    for (const wrapper of controllers) {
      const instance = wrapper.instance as Record<string, unknown> | null
      const controllerName = wrapper.metatype?.name ?? instance?.constructor?.name ?? 'UnknownController'
      if (!instance) continue

      const classCodes = Reflect.getMetadata(PERMISSION_KEY, wrapper.metatype ?? instance.constructor)
      this.collect(classCodes, controllerName, unknown, catalog)

      for (const method of this.scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
        const handler = instance[method]
        if (typeof handler !== 'function') continue
        const methodCodes = Reflect.getMetadata(PERMISSION_KEY, handler)
        this.collect(methodCodes, `${controllerName}.${method}`, unknown, catalog)
      }
    }

    if (unknown.size > 0) {
      const detail = [...unknown.entries()]
        .map(([code, locations]) => `${code} @ ${locations.join(', ')}`)
        .join('; ')
      const message = `权限码目录校验失败，发现未登记权限码: ${detail}`
      this.logger.error(message)
      throw new Error(message)
    }

    this.logger.log(
      `权限码目录校验通过：${controllers.length} 个控制器，全部权限码已在目录中（${catalog.size} 项）`,
    )
  }

  private collect(
    value: unknown,
    location: string,
    unknown: Map<string, string[]>,
    catalog: Set<string>,
  ): void {
    if (value == null) return
    const codes = Array.isArray(value) ? value : [value]
    for (const code of codes) {
      if (typeof code !== 'string' || catalog.has(code)) continue
      const locations = unknown.get(code) ?? []
      locations.push(location)
      unknown.set(code, locations)
    }
  }
}
