import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { ExperienceRecord, ExperienceRule, LevelTier } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { RedisService } from '../../common/redis/redis.service'
import { CACHE_KEYS, CACHE_TTL } from '../../common/redis/cache-keys'
import { formatNow } from '../../common/utils/time'
import type { SaveLevelTiersDto } from './dto/save-level-tiers.dto'
import type { UpdateExperienceRuleDto } from './dto/update-experience-rule.dto'

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

/* 规则管理（wiki-backend.md §7.11/§10）：
 * 经验值规则（6 条固定项仅编辑经验值与启停）、经验值发放记录（source=rule）、
 * 等级梯度整组保存（1-10 级、门槛逐级递增，事务内整体替换）。
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

  async listLevelTiers(): Promise<LevelTier[]> {
    /* 与积分引擎共用 rules:levels（按 level 升序；引擎内部再按 threshold 降序解析等级） */
    return this.redis.remember(CACHE_KEYS.levelTiers, CACHE_TTL.stable, () =>
      this.prisma.levelTier.findMany({ orderBy: { level: 'asc' } }),
    )
  }

  async saveLevelTiers(dto: SaveLevelTiersDto): Promise<{ code: number }> {
    const tiers = dto.tiers
    if (!Array.isArray(tiers) || tiers.length === 0) throw new BadRequestException('至少保留 1 个等级')
    if (tiers.length > 10) throw new BadRequestException('等级最多 10 级')
    if (tiers.some((t) => !(t.label ?? '').trim())) throw new BadRequestException('等级标签不能为空')
    if (tiers.some((t) => !Number.isInteger(t.threshold) || (t.threshold ?? -1) < 0)) {
      throw new BadRequestException('门槛经验值必须为不小于 0 的整数')
    }
    for (let i = 1; i < tiers.length; i++) {
      if ((tiers[i].threshold ?? -1) <= (tiers[i - 1].threshold ?? -1)) {
        throw new BadRequestException('门槛经验值必须逐级递增')
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.levelTier.deleteMany()
      await tx.levelTier.createMany({
        data: tiers.map((t, i) => ({
          level: i + 1,
          label: t.label!,
          threshold: t.threshold!,
        })),
      })
    })

    await this.redis.delCache(CACHE_KEYS.levelTiers)
    return { code: 0 }
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
