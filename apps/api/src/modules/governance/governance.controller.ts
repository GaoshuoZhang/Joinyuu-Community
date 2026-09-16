import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { GovernanceService } from './governance.service'
import { ReviewAppealDto, ReviewReportDto, SavePolicyDto } from './dto/governance.dto'

@RequirePermission('/governance')
@Controller('api/admin/governance')
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('reports')
  reports(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string, @Query('targetType') targetType?: string) {
    return this.governance.reports(Math.max(1, Number(page) || 1), Math.max(1, Math.min(100, Number(pageSize) || 20)), status, targetType)
  }

  @HttpCode(200)
  @Post('reports/:id/review')
  reviewReport(@Param('id') id: string, @Body() dto: ReviewReportDto, @Req() req: AuthenticatedRequest) {
    return this.governance.reviewReport(id, dto, req.user?.name ?? '社区管理员')
  }

  @Get('appeals')
  appeals(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    return this.governance.appeals(Math.max(1, Number(page) || 1), Math.max(1, Math.min(100, Number(pageSize) || 20)), status)
  }

  @HttpCode(200)
  @Post('appeals/:id/review')
  reviewAppeal(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewAppealDto, @Req() req: AuthenticatedRequest) {
    return this.governance.reviewAppeal(id, dto, req.user?.name ?? '社区管理员')
  }

  @Get('policies')
  policies() { return this.governance.policies() }

  @HttpCode(200)
  @Post('policies')
  createPolicy(@Body() dto: SavePolicyDto, @Req() req: AuthenticatedRequest) { return this.governance.createPolicy(dto, req.user?.name ?? '社区管理员') }

  @HttpCode(200)
  @Put('policies/:id')
  updatePolicy(@Param('id') id: string, @Body() dto: SavePolicyDto, @Req() req: AuthenticatedRequest) { return this.governance.updatePolicy(id, dto, req.user?.name ?? '社区管理员') }
}
