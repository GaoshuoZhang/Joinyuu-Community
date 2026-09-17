import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { EngagementService } from './engagement.service'
import { AnalyticsDto } from './engagement.dto'

@Controller('api/app')
export class EngagementController {
  constructor(private readonly service: EngagementService) {}
  @Get('me/stats') stats(@Req() req: AppAuthenticatedRequest) { return this.service.stats(req.user!.sub) }
  @Get('me/enterprise-workbench') workbench(@Req() req: AppAuthenticatedRequest, @Query('enterpriseId') id: string) { return this.service.workbench(req.user!.sub, id ?? '') }
  @Post('analytics/events') @HttpCode(200) analytics(@Req() req: AppAuthenticatedRequest, @Body() dto: AnalyticsDto) { return this.service.analytics(req.user!.sub, dto) }
}
