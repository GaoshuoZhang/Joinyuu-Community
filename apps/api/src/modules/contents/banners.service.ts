import { Injectable, NotFoundException } from '@nestjs/common'
import { AuditService } from '../../common/audit/audit.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_KEYS } from '../../common/redis/cache-keys'
import { formatNow } from '../../common/utils/time'
import type { BannerPayloadDto } from './dto/banner-payload.dto'

export interface HomeBannerRecord {
  id: string
  title: string
  subtitle: string
  imageUrl: string | null
  link: string | null
  sort: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface HomeBannerDelegate {
  findMany(args: { orderBy: Array<Record<string, 'asc' | 'desc'>> }): Promise<HomeBannerRecord[]>
  findUnique(args: { where: { id: string } }): Promise<HomeBannerRecord | null>
  create(args: { data: HomeBannerRecord }): Promise<HomeBannerRecord>
  update(args: { where: { id: string }; data: Partial<Omit<HomeBannerRecord, 'id' | 'createdAt'>> }): Promise<HomeBannerRecord>
  delete(args: { where: { id: string } }): Promise<HomeBannerRecord>
}

@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  findAll(): Promise<HomeBannerRecord[]> {
    return this.delegate.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] })
  }

  /** 首页轮播图总开关（与系统配置共享单例，关闭后客户端首页不展示轮播区域） */
  async getSettings(): Promise<{ carouselOpen: boolean }> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 }, select: { homeCarouselOpen: true } })
    return { carouselOpen: config?.homeCarouselOpen ?? true }
  }

  async saveSettings(carouselOpen: boolean, operator: string): Promise<{ code: number }> {
    const previous = await this.prisma.systemConfig.findUnique({ where: { id: 1 }, select: { homeCarouselOpen: true } })
    await this.prisma.systemConfig.update({
      where: { id: 1 },
      data: { homeCarouselOpen: carouselOpen, updatedAt: formatNow(), updatedBy: operator },
    })
    await this.redis.delCache(CACHE_KEYS.systemConfig)
    await this.audit.record({
      module: '内容管理',
      action: carouselOpen ? '开启首页轮播图' : '关闭首页轮播图',
      target: '首页轮播图',
      before: { homeCarouselOpen: previous?.homeCarouselOpen ?? true },
      after: { homeCarouselOpen: carouselOpen },
      operator,
    })
    return { code: 0 }
  }

  async create(payload: BannerPayloadDto, operator: string): Promise<HomeBannerRecord> {
    const now = formatNow()
    const banner = await this.delegate.create({
      data: {
        id: await this.ids.next('BN'),
        ...this.dataOf(payload),
        createdAt: now,
        updatedAt: now,
      },
    })
    await this.audit.record({
      module: '内容管理',
      action: '新增轮播图',
      target: `${banner.id} · ${banner.title}`,
      after: this.auditSnapshot(banner),
      operator,
    })
    return banner
  }

  async update(id: string, payload: BannerPayloadDto, operator: string): Promise<HomeBannerRecord> {
    const current = await this.findOne(id)
    const banner = await this.delegate.update({
      where: { id },
      data: { ...this.dataOf(payload), updatedAt: formatNow() },
    })
    await this.audit.record({
      module: '内容管理',
      action: '编辑轮播图',
      target: `${banner.id} · ${banner.title}`,
      before: this.auditSnapshot(current),
      after: this.auditSnapshot(banner),
      operator,
    })
    return banner
  }

  async toggleEnabled(id: string, operator: string): Promise<HomeBannerRecord> {
    const current = await this.findOne(id)
    const banner = await this.delegate.update({
      where: { id },
      data: { enabled: !current.enabled, updatedAt: formatNow() },
    })
    await this.audit.record({
      module: '内容管理',
      action: banner.enabled ? '启用轮播图' : '停用轮播图',
      target: `${banner.id} · ${banner.title}`,
      before: { enabled: current.enabled },
      after: { enabled: banner.enabled },
      operator,
    })
    return banner
  }

  async remove(id: string, operator: string): Promise<{ code: number }> {
    const current = await this.findOne(id)
    await this.delegate.delete({ where: { id } })
    await this.audit.record({
      module: '内容管理',
      action: '删除轮播图',
      target: `${current.id} · ${current.title}`,
      before: this.auditSnapshot(current),
      operator,
    })
    return { code: 0 }
  }

  private get delegate(): HomeBannerDelegate {
    return (this.prisma as unknown as { homeBanner: HomeBannerDelegate }).homeBanner
  }

  private async findOne(id: string): Promise<HomeBannerRecord> {
    const banner = await this.delegate.findUnique({ where: { id } })
    if (!banner) throw new NotFoundException('轮播图不存在')
    return banner
  }

  private dataOf(payload: BannerPayloadDto) {
    return {
      title: payload.title.trim(),
      subtitle: payload.subtitle.trim(),
      imageUrl: payload.imageUrl?.trim() || null,
      link: payload.link?.trim() || null,
      sort: payload.sort,
      enabled: payload.enabled,
    }
  }

  private auditSnapshot(banner: HomeBannerRecord) {
    return {
      title: banner.title,
      subtitle: banner.subtitle,
      imageUrl: banner.imageUrl,
      link: banner.link,
      sort: banner.sort,
      enabled: banner.enabled,
    }
  }
}
