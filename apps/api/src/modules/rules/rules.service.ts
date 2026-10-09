import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { ExperienceRecord, ExperienceRule, Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_KEYS, CACHE_TTL } from '../../common/redis/cache-keys'
import { formatNow } from '../../common/utils/time'
import { FULL_PRICE_DISCOUNT, normalizeDiscount } from '../../common/points/points-discount'
import type { SaveLevelTiersDto } from './dto/save-level-tiers.dto'
import type { UpdateExperienceRuleDto } from './dto/update-experience-rule.dto'

const LEVEL_IDENTITIES = ['community_individual', 'community_enterprise'] as const
const PUBLISHING_IDENTITIES = ['personal_unverified', 'personal_verified', ...LEVEL_IDENTITIES] as const
/** 仅个人用户（未实名/已实名）的固定身份组：其余身份组额度按等级在等级规则页维护 */
const PERSONAL_IDENTITIES = ['personal_unverified', 'personal_verified'] as const
const PUBLISHING_ACTIONS = ['demand_publish', 'article_publish', 'event_enroll', 'space_reserve'] as const
/** 等级规则页随等级梯度一起维护的动作（活动报名/空间预约仍在发布限制页按身份组维护口径不变） */
const LEVEL_SCOPED_ACTIONS = ['demand_publish', 'article_publish'] as const
type LevelIdentity = typeof LEVEL_IDENTITIES[number]

/* 返回形状与 apps/admin/src/types/index.ts 逐字段一致（可空字段 null → undefined） */
export interface ExperienceRuleDto {
  code: string
  name: string
  scene: string
  exp: number
  status: string
  description?: string
  updatedAt: string
}

/* 等级梯度 DTO：等级行 + 该等级的每日发布额度（发布额度存 PublishingLimitRule）+
 * 积分消费折扣（LevelTier.pointsDiscount，1 = 1 折 … 10 = 原价） */
export interface LevelTierDto {
  identityType: string
  level: number
  label: string
  threshold: number
  pointsDiscount: number
  demandPublishLimit: number
  articleSubmitLimit: number
}

/* 规则管理（wiki-backend.md §7.11/§10）：
 * 经验值规则（6 条固定项仅编辑经验值与启停）、经验值发放记录（source=rule）、
 * 等级梯度整组保存（1-10 级、门槛逐级递增，事务内整体替换；含按等级的发布额度与积分消费折扣）。
 * rules:experience / rules:levels 走缓存（10min，与积分引擎共用同一键），写操作主动失效。 */
@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /* ---------- 经验值规则 ---------- */

  async listExperienceRules(): Promise<ExperienceRuleDto[]> {
    /* 与积分引擎共用 rules:experience（存原始行，按 code 升序，保证两边缓存内容一致） */
    const rules = await this.redis.remember(CACHE_KEYS.experienceRules, CACHE_TTL.stable, () =>
      this.prisma.experienceRule.findMany({ orderBy: { code: 'asc' } }),
    )
    return rules.map(toExperienceRuleDto)
  }

  async updateExperienceRule(code: string, dto: UpdateExperienceRuleDto): Promise<{ code: number }> {
    const rule = await this.prisma.experienceRule.findUnique({ where: { code } })
    if (!rule) throw new NotFoundException('经验值规则不存在')
    if (!Number.isInteger(dto.exp) || dto.exp <= 0) {
      throw new BadRequestException('经验值必须为正整数')
    }

    await this.prisma.experienceRule.update({
      where: { code },
      data: { exp: dto.exp, updatedAt: formatNow() },
    })

    await this.redis.delCache(CACHE_KEYS.experienceRules)
    return { code: 0 }
  }

  async toggleExperienceRuleStatus(code: string): Promise<{ code: number }> {
    const rule = await this.prisma.experienceRule.findUnique({ where: { code } })
    if (!rule) throw new NotFoundException('经验值规则不存在')

    await this.prisma.experienceRule.update({
      where: { code },
      data: { status: rule.status === 'enabled' ? 'disabled' : 'enabled', updatedAt: formatNow() },
    })

    await this.redis.delCache(CACHE_KEYS.experienceRules)
    return { code: 0 }
  }

  /* ---------- 经验值发放记录（流水，不缓存） ---------- */

  async listExperienceIssuance(): Promise<ExperienceRecord[]> {
    return this.prisma.experienceRecord.findMany({
      where: { source: 'rule' },
      orderBy: { at: 'desc' },
    })
  }

  /* ---------- 等级梯度 ---------- */

  async listLevelTiers(identityType?: string): Promise<LevelTierDto[]> {
    const scope = this.levelIdentity(identityType ?? 'community_individual')
    /* 等级行沿用共用缓存（积分引擎同键，缓存内始终是原始行）；发布额度不缓存，读取时合并 */
    const tiers = await this.redis.remember(CACHE_KEYS.levelTiers(scope), CACHE_TTL.stable, () =>
      this.prisma.levelTier.findMany({ where: { identityType: scope }, orderBy: { level: 'asc' } }),
    )
    const rules = await this.prisma.publishingLimitRule.findMany({
      where: { identityType: scope, action: { in: [...LEVEL_SCOPED_ACTIONS] } },
    })
    const limitOf = (level: number, action: typeof LEVEL_SCOPED_ACTIONS[number]): number =>
      rules.find((row) => row.level === level && row.action === action)?.dailyLimit ?? -1
    return tiers.map((tier) => ({
      identityType: tier.identityType,
      level: tier.level,
      label: tier.label,
      threshold: tier.threshold,
      pointsDiscount: normalizeDiscount(tier.pointsDiscount),
      demandPublishLimit: limitOf(tier.level, 'demand_publish'),
      articleSubmitLimit: limitOf(tier.level, 'article_publish'),
    }))
  }

  async saveLevelTiers(dto: SaveLevelTiersDto): Promise<{ code: number }> {
    const identityType = this.levelIdentity(dto.identityType ?? 'community_individual')
    const tiers = dto.tiers
    if (!Array.isArray(tiers) || tiers.length === 0) throw new BadRequestException('至少保留 1 个等级')
    if (tiers.length > 10) throw new BadRequestException('等级最多 10 级')
    if (tiers.some((t) => !(t.label ?? '').trim())) throw new BadRequestException('等级标签不能为空')
    if (tiers.some((t) => !Number.isInteger(t.threshold) || (t.threshold ?? -1) < 0)) {
      throw new BadRequestException('门槛经验值必须为不小于 0 的整数')
    }
    if (tiers.some((t) => t.pointsDiscount != null && !this.isDiscountValue(t.pointsDiscount))) {
      throw new BadRequestException('积分消费折扣只能填写 1-10（最多一位小数，10 = 原价）')
    }
    for (const [field, label] of [['demandPublishLimit', '需求发布'], ['articleSubmitLimit', '文章投稿']] as const) {
      if (tiers.some((t) => {
        const value = t[field]
        return value != null && (!Number.isInteger(value) || value < -1 || value > 10000)
      })) {
        throw new BadRequestException(`${label}额度只能填写 -1 或 0 至 10000 的整数`)
      }
    }
    for (let i = 1; i < tiers.length; i++) {
      if ((tiers[i].threshold ?? -1) <= (tiers[i - 1].threshold ?? -1)) {
        throw new BadRequestException('门槛经验值必须逐级递增')
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.levelTier.deleteMany({ where: { identityType } })
      await tx.levelTier.createMany({
        data: tiers.map((t, i) => ({
          identityType,
          level: i + 1,
          label: t.label!,
          threshold: t.threshold!,
          pointsDiscount: t.pointsDiscount == null ? FULL_PRICE_DISCOUNT : normalizeDiscount(t.pointsDiscount),
        })),
      })
      await tx.publishingLimitRule.deleteMany({ where: { identityType, level: { gt: tiers.length } } })
      for (let level = 1; level <= tiers.length; level++) {
        const input = tiers[level - 1]
        for (const action of PUBLISHING_ACTIONS) {
          /* 等级页只提交需求发布/文章投稿额度；其余动作保留既有额度（缺行时按不限补建） */
          const provided = action === 'demand_publish' ? input?.demandPublishLimit
            : action === 'article_publish' ? input?.articleSubmitLimit
            : undefined
          await tx.publishingLimitRule.upsert({
            where: { identityType_level_action: { identityType, level, action } },
            create: { identityType, level, action, dailyLimit: provided ?? -1 },
            update: provided === undefined ? {} : { dailyLimit: provided },
          })
        }
      }
      if (identityType === 'community_enterprise') {
        const enterprises = await tx.enterprise.findMany({ select: { id: true, experience: true } })
        for (const enterprise of enterprises) {
          const level = this.resolveLevel(tiers, enterprise.experience)
          await tx.userIdentity.updateMany({ where: { type: identityType, enterpriseId: enterprise.id }, data: { experience: enterprise.experience, level } })
        }
      } else {
        const identities = await tx.userIdentity.findMany({ where: { type: identityType }, select: { id: true, experience: true } })
        for (const identity of identities) {
          await tx.userIdentity.update({ where: { id: identity.id }, data: { level: this.resolveLevel(tiers, identity.experience ?? 0) } })
        }
      }
    })

    await this.redis.delCache(CACHE_KEYS.levelTiers(identityType))
    return { code: 0 }
  }

  async listPublishingLimits(identityType?: string, scope?: string) {
    if (identityType && !PUBLISHING_IDENTITIES.includes(identityType as typeof PUBLISHING_IDENTITIES[number])) {
      throw new BadRequestException('发布额度身份类型无效')
    }
    /* scope=personal：只返回个人用户（未实名/已实名）两行；等级相关额度在等级规则页维护 */
    const where: Prisma.PublishingLimitRuleWhereInput = identityType
      ? { identityType }
      : scope === 'personal'
        ? { identityType: { in: [...PERSONAL_IDENTITIES] } }
        : {}
    const rows = await this.prisma.publishingLimitRule.findMany({
      where,
      orderBy: [{ identityType: 'asc' }, { level: 'asc' }, { action: 'asc' }],
    })
    const tiers = await this.prisma.levelTier.findMany({ orderBy: { level: 'asc' } })
    const labels = new Map(tiers.map((tier) => [`${tier.identityType}:${tier.level}`, tier.label]))
    const grouped = new Map<string, Record<string, number | string>>()
    for (const row of rows) {
      const key = `${row.identityType}:${row.level}`
      const entry = grouped.get(key) ?? {
        scope: row.identityType,
        ...(row.level > 0 ? { level: row.level, levelLabel: labels.get(key) ?? `${row.level} 级` } : {}),
        demandPublishLimit: -1,
        articleSubmitLimit: -1,
        eventEnrollLimit: -1,
        spaceReserveLimit: -1,
      }
      const field = {
        demand_publish: 'demandPublishLimit',
        article_publish: 'articleSubmitLimit',
        event_enroll: 'eventEnrollLimit',
        space_reserve: 'spaceReserveLimit',
      }[row.action]
      if (field) entry[field] = row.dailyLimit
      grouped.set(key, entry)
    }
    return [...grouped.values()]
  }

  async savePublishingLimits(rows: Array<Record<string, unknown>>) {
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('发布限制不能为空')
    const actionFields = {
      demandPublishLimit: 'demand_publish',
      articleSubmitLimit: 'article_publish',
      eventEnrollLimit: 'event_enroll',
      spaceReserveLimit: 'space_reserve',
    } as const
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const identityType = String(row.scope ?? '')
        const level = Number(row.level ?? 0)
        if (!PUBLISHING_IDENTITIES.includes(identityType as typeof PUBLISHING_IDENTITIES[number])) throw new BadRequestException('发布额度身份类型无效')
        const dynamic = LEVEL_IDENTITIES.includes(identityType as LevelIdentity)
        if ((!dynamic && level !== 0) || !Number.isInteger(level) || level < 0) throw new BadRequestException('发布额度等级无效')
        if (dynamic && !await tx.levelTier.findUnique({ where: { identityType_level: { identityType, level } } })) {
          throw new BadRequestException('发布额度等级不存在')
        }
        for (const [field, action] of Object.entries(actionFields)) {
          const dailyLimit = Number(row[field])
          if (!Number.isInteger(dailyLimit) || dailyLimit < -1 || dailyLimit > 10000) throw new BadRequestException('限制次数只能填写 -1 或 0 至 10000 的整数')
          await tx.publishingLimitRule.upsert({
            where: { identityType_level_action: { identityType, level, action } },
            create: { identityType, level, action, dailyLimit },
            update: { dailyLimit },
          })
        }
      }
    })
    return { code: 0 }
  }

  private levelIdentity(value: string): LevelIdentity {
    if (!LEVEL_IDENTITIES.includes(value as LevelIdentity)) throw new BadRequestException('等级身份类型无效')
    return value as LevelIdentity
  }

  private resolveLevel(tiers: Array<{ threshold?: number }>, experience: number): number {
    let level = 1
    tiers.forEach((tier, index) => { if ((tier.threshold ?? 0) <= experience) level = index + 1 })
    return level
  }

  /** 折扣入参校验：1-10 且最多一位小数（8.5 = 85 折） */
  private isDiscountValue(value: number): boolean {
    if (!Number.isFinite(value)) return false
    const tenths = value * 10
    return Math.abs(tenths - Math.round(tenths)) < 1e-6 && Math.round(tenths) >= 10 && Math.round(tenths) <= 100
  }
}

function toExperienceRuleDto(rule: ExperienceRule): ExperienceRuleDto {
  const dto: ExperienceRuleDto = {
    code: rule.code,
    name: rule.name,
    scene: rule.scene,
    exp: rule.exp,
    status: rule.status,
    updatedAt: rule.updatedAt,
  }
  if (rule.description != null) dto.description = rule.description
  return dto
}
