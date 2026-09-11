import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { LedgersService } from './ledgers.service'
import { AdjustExperienceDto } from './dto/adjust-experience.dto'
import { AdjustPointsDto } from './dto/adjust-points.dto'
import { QueryExperienceRecordsDto } from './dto/query-experience-records.dto'
import { QueryPointsRecordsDto } from './dto/query-points-records.dto'

@Controller('api/admin')
export class LedgersController {
  constructor(private readonly ledgers: LedgersService) {}

  @RequirePermission('/rules/experience-records')
  @Get('experience-records')
  findExperienceRecords(@Query() query: QueryExperienceRecordsDto) {
    return this.ledgers.findExperienceRecords(query.targetType, query.targetId)
  }

  @RequirePermission('/rules/experience-records')
  @HttpCode(200)
  @Post('experience-records')
  adjustExperience(@Body() dto: AdjustExperienceDto, @Req() req: AuthenticatedRequest) {
    return this.ledgers.adjustExperience(
      dto.targetType,
      dto.targetId,
      dto.delta,
      dto.reason,
      req.user?.name ?? '社区管理员',
    )
  }

  @RequirePermission('/rules/ledger')
  @Get('points-records')
  findPointsRecords(@Query() query: QueryPointsRecordsDto) {
    return this.ledgers.findPointsRecords(query.userId)
  }

  @RequirePermission('/rules/ledger')
  @HttpCode(200)
  @Post('points-records')
  adjustPoints(@Body() dto: AdjustPointsDto, @Req() req: AuthenticatedRequest) {
    return this.ledgers.adjustPoints(dto.userId, dto.delta, dto.reason, req.user?.name ?? '社区管理员')
  }
}
