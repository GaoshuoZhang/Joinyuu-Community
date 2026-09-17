import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { DictEntry, SystemConfig } from '@prisma/client'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { RedisService } from '../../../common/redis/redis.service'
import { CACHE_KEYS, CACHE_TTL, dictCacheKey } from '../../../common/redis/cache-keys'

/** App 端下发允许的字典类型（与 admin DICT_TYPE_LABELS 对齐） */
const APP_DICT_TYPES: readonly string[] = [
  'demand_category',
  'industry',
  'event_type',
  'goods_category',
]

/** App 端下发的站点配置子集：仅业务开关，剔除 updatedAt/updatedBy 等管理字段 */
export interface SiteConfigDto {
  siteName: string
  siteSlogan: string
  registrationOpen: boolean
  mallOpen: boolean
  demandOpen: boolean
  reservationOpen: boolean
  homeCarouselOpen: boolean
}

export interface DictItemDto {
  code: string
  label: string
}

export interface DictBundleDto {
  type: string
  items: DictItemDto[]
}

/* 配置与字典下发（M2-R R1）：
 * - 站点配置：读 SystemConfig 单例（id=1），走 config:system 缓存键与 admin 共享、写失效联动；
 *   回源时写入与 admin 完全一致的完整结构，避免覆盖共享缓存导致 admin 缺失管理字段。
 * - 字典：读 dicts:{type} 缓存键与 admin 共享，仅返回 status='enabled' 项、按 sort 升序。 */
@Injectable()
export class ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSiteConfig(): Promise<SiteConfigDto> {
    const full = await this.redis.remember<Record<string, unknown>>(
      CACHE_KEYS.systemConfig,
      CACHE_TTL.stable,
      () => this.loadSystemConfigFull(),
    )
    return {
      siteName: String(full.siteName ?? ''),
      siteSlogan: String(full.siteSlogan ?? ''),
      registrationOpen: Boolean(full.registrationOpen),
      mallOpen: Boolean(full.mallOpen),
      demandOpen: Boolean(full.demandOpen),
      reservationOpen: Boolean(full.reservationOpen),
      homeCarouselOpen: Boolean(full.homeCarouselOpen),
    }
  }

  async getDict(type: string): Promise<DictBundleDto> {
    this.assertType(type)
    const items = await this.redis.remember<DictEntry[]>(
      dictCacheKey(type),
      CACHE_TTL.stable,
      () => this.prisma.dictEntry.findMany({ where: { type }, orderBy: { sort: 'asc' } }),
    )
    return { type, items: this.enabledItems(items) }
  }

  async getDictBundle(): Promise<Record<string, DictBundleDto>> {
    const bundle: Record<string, DictBundleDto> = {}
    for (const type of APP_DICT_TYPES) {
      bundle[type] = await this.getDict(type)
    }
    return bundle
  }

  private enabledItems(list: DictEntry[]): DictItemDto[] {
    return list
      .filter((entry) => entry.status === 'enabled')
      .map((entry) => ({ code: entry.code, label: entry.label }))
  }

  private assertType(type: string): void {
    if (!APP_DICT_TYPES.includes(type)) throw new BadRequestException('字典类型不存在')
  }

  /** 回源 SystemConfig 单例并返回与 admin 一致的完整结构（保证共享缓存内容兼容） */
  private async loadSystemConfigFull(): Promise<Record<string, unknown>> {
    const c = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (!c) throw new NotFoundException('系统配置不存在')
    return toFullSystemConfig(c)
  }
}

function toFullSystemConfig(config: SystemConfig): Record<string, unknown> {
  return {
    siteName: config.siteName,
    siteSlogan: config.siteSlogan,
    registrationOpen: config.registrationOpen,
    mallOpen: config.mallOpen,
    demandOpen: config.demandOpen,
    reservationOpen: config.reservationOpen,
    realnameRequired: config.realnameRequired,
    homeCarouselOpen: config.homeCarouselOpen,
    leaseExpireRemindDays: config.leaseExpireRemindDays,
    uploadMaxSizeMb: config.uploadMaxSizeMb,
    passwordExpireDays: config.passwordExpireDays,
    minioEnabled: config.minioEnabled,
    minioEndpoint: config.minioEndpoint,
    minioPort: config.minioPort,
    minioUseSsl: config.minioUseSsl,
    minioAccessKey: config.minioAccessKey,
    minioSecretKey: config.minioSecretKey,
    minioBucket: config.minioBucket,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
  }
}