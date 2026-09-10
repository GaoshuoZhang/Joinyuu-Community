import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import { RulesService } from './rules.service'
import { SaveLevelTiersDto } from './dto/save-level-tiers.dto'
import { UpdateExperienceRuleDto } from './dto/update-experience-rule.dto'

@Controller('api/admin/rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  /* ---------- 经验值规则 ---------- */

  @Get('experience')
  listExperienceRules() {
    return this.rules.listExperienceRules()
  }

  @HttpCode(200)
  @Put('experience/:code')
  updateExperienceRule(@Param('code') code: string, @Body() dto: UpdateExperienceRuleDto) {
    return this.rules.updateExperienceRule(code, dto)
  }

  @HttpCode(200)
  @Post('experience/:code/toggle-status')
  toggleExperienceRuleStatus(@Param('code') code: string) {
    return this.rules.toggleExperienceRuleStatus(code)
  }

  /* ---------- 经验发放记录 ---------- */

  @Get('experience-issuance')
  listExperienceIssuance() {
    return this.rules.listExperienceIssuance()
  }

  /* ---------- 等级梯度 ---------- */

  @Get('levels')
  listLevelTiers() {
    return this.rules.listLevelTiers()
  }

  @HttpCode(200)
  @Put('levels')
  saveLevelTiers(@Body() dto: SaveLevelTiersDto) {
    return this.rules.saveLevelTiers(dto)
  }
}
