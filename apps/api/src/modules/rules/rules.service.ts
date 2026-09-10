import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { ExperienceRecord, ExperienceRule, LevelTier } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { formatNow } from '../../common/utils/time'
import type { SaveLevelTiersDto } from './dto/save-level-tiers.dto'
import type { UpdateExperienceRuleDto } from './dto/update-experience-rule.dto'

/* M0 形状（apps/admin/src/types/index.ts）——返回与 M0 stub 逐字段一致（可空字段 null → undefined） */
export interface ExperienceRuleDto {
  code: string
  name: string
  scene: string
  exp: number
  status: string
  description?: string
  updatedAt: string
}

/* 规则管理（wiki-backend.md §7.11）：
 * 经验值规则（5 条固定项仅编辑经验值与启停）、经验发放记录（source=rule）、
 * 等级梯度整组保存（1-10 级、门槛逐级递增，事务内整体替换） */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------- 经验值规则 ---------- */

  async listExperienceRules(): Promise<ExperienceRuleDto[]> {
    const rules = await this.prisma.experienceRule.findMany({ orderBy: { code: 'asc' } })
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
    return { code: 0 }
  }

  async toggleExperienceRuleStatus(code: string): Promise<{ code: number }> {
    const rule = await this.prisma.experienceRule.findUnique({ where: { code } })
    if (!rule) throw new NotFoundException('经验值规则不存在')

    await this.prisma.experienceRule.update({
      where: { code },
      data: { status: rule.status === 'enabled' ? 'disabled' : 'enabled', updatedAt: formatNow() },
    })
    return { code: 0 }
  }

  /* ---------- 经验发放记录 ---------- */

  async listExperienceIssuance(): Promise<ExperienceRecord[]> {
    return this.prisma.experienceRecord.findMany({
      where: { source: 'rule' },
      orderBy: { at: 'desc' },
    })
  }

  /* ---------- 等级梯度 ---------- */

  async listLevelTiers(): Promise<LevelTier[]> {
    return this.prisma.levelTier.findMany({ orderBy: { level: 'asc' } })
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
