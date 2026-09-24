import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { RulesService } from './rules.service'
import { SaveLevelTiersDto } from './dto/save-level-tiers.dto'
import { UpdateExperienceRuleDto } from './dto/update-experience-rule.dto'

@Controller('api/admin/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  /* ---------- 经验值规则 ---------- */

  @RequirePermission('/rules/experience')
  @Get('experience')
  listExperienceRules() {
    return this.rules.listExperienceRules()
  }

  @RequirePermission('/rules/experience')
  @HttpCode(200)
  @Put('experience/:code')
  updateExperienceRule(@Param('code') code: string, @Body() dto: UpdateExperienceRuleDto) {
    return this.rules.updateExperienceRule(code, dto)
  }

  @RequirePermission('/rules/experience')
  @HttpCode(200)
  @Post('experience/:code/toggle-status')
  toggleExperienceRuleStatus(@Param('code') code: string) {
    return this.rules.toggleExperienceRuleStatus(code)
  }

  /* ---------- 经验值发放记录 ---------- */

  @RequirePermission('/rules/experience-records')
  @Get('experience-issuance')
  listExperienceIssuance() {
    return this.rules.listExperienceIssuance()
  }

  /* ---------- 等级梯度 ---------- */

  @RequirePermission('/rules/levels')
  @Get('levels')
  listLevelTiers(@Query('identityType') identityType?: string) {
    return this.rules.listLevelTiers(identityType)
  }

  @RequirePermission('/rules/levels')
  @HttpCode(200)
  @Put('levels')
  saveLevelTiers(@Body() dto: SaveLevelTiersDto) {
    return this.rules.saveLevelTiers(dto)
  }

  @RequirePermission('/rules/publishing-limits')
  @Get('publishing-limits')
  listPublishingLimits(@Query('identityType') identityType?: string, @Query('scope') scope?: string) {
    return this.rules.listPublishingLimits(identityType, scope)
  }

  @RequirePermission('/rules/publishing-limits')
  @HttpCode(200)
  @Put('publishing-limits')
  savePublishingLimits(@Body() dto: { rules?: Array<Record<string, unknown>> }) {
    return this.rules.savePublishingLimits(dto.rules ?? [])
  }
}
