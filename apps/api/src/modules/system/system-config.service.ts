import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { SystemConfig } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuditService } from '../../common/audit/audit.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_KEYS, CACHE_TTL } from '../../common/redis/cache-keys'
import { formatNow } from '../../common/utils/time'
import type { SystemConfigPayloadDto } from './dto/system-config-payload.dto'

/* 系统配置（wiki-backend.md §7.15/§10）：单例读写，保存即生效并留痕（含 before/after 快照）；
 * GET 走 config:system 缓存（10min），PUT 主动失效。leaseExpireRemindDays 供租约临期通知任务与工作台待办读取。 */
@Injectable()
export class SystemConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async get(): Promise<Record<string, unknown>> {
    return this.redis.remember(CACHE_KEYS.systemConfig, CACHE_TTL.stable, async () => {
      const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
      if (!config) throw new NotFoundException('系统配置不存在')
      return toSystemConfigDto(config)
    })
  }

  async save(payload: SystemConfigPayloadDto, operator: string): Promise<{ code: number }> {
    const siteName = (payload.siteName ?? '').trim()
    if (!siteName) throw new BadRequestException('站点名称不能为空')

    const days = payload.leaseExpireRemindDays
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('租约临期提醒窗口须为 1-90 的整数')
    }

    const uploadMaxSizeMb = payload.uploadMaxSizeMb
    if (!Number.isInteger(uploadMaxSizeMb) || uploadMaxSizeMb < 1 || uploadMaxSizeMb > 100) {
      throw new BadRequestException('上传文件大小限制须为 1-100 的整数')
    }

    const previous = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })

    const next = {
      siteName,
      siteSlogan: (payload.siteSlogan ?? '').trim(),
      registrationOpen: payload.registrationOpen,
      mallOpen: payload.mallOpen,
      demandOpen: payload.demandOpen,
      reservationOpen: payload.reservationOpen,
      leaseExpireRemindDays: days,
      uploadMaxSizeMb,
    }

    await this.prisma.systemConfig.update({
      where: { id: 1 },
      data: { ...next, updatedAt: formatNow(), updatedBy: operator },
    })

    await this.audit.record({
      module: '系统管理',
      action: '保存系统配置',
      target: '系统配置',
      detail: `临期提醒 ${days} 天 · 上传上限 ${uploadMaxSizeMb} MB`,
      before: previous
        ? {
            siteName: previous.siteName,
            siteSlogan: previous.siteSlogan,
            registrationOpen: previous.registrationOpen,
            mallOpen: previous.mallOpen,
            demandOpen: previous.demandOpen,
            reservationOpen: previous.reservationOpen,
            leaseExpireRemindDays: previous.leaseExpireRemindDays,
            uploadMaxSizeMb: previous.uploadMaxSizeMb,
          }
        : undefined,
      after: next,
      operator,
    })

    await this.redis.delCache(CACHE_KEYS.systemConfig)
    return { code: 0 }
  }
}

function toSystemConfigDto(config: SystemConfig): Record<string, unknown> {
  return {
    siteName: config.siteName,
    siteSlogan: config.siteSlogan,
    registrationOpen: config.registrationOpen,
    mallOpen: config.mallOpen,
    demandOpen: config.demandOpen,
    reservationOpen: config.reservationOpen,
    leaseExpireRemindDays: config.leaseExpireRemindDays,
    uploadMaxSizeMb: config.uploadMaxSizeMb,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  }
}
