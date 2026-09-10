import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { ApplicationsService } from './applications.service'
import { QueryApplicationsDto } from './dto/query-applications.dto'
import { ReviewApplicationDto } from './dto/review-application.dto'

@Controller('api/admin/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  findAll(@Query() query: QueryApplicationsDto) {
    return this.applications.findAll(query)
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.applications.approve(id, dto.comment, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.applications.reject(id, dto.comment, req.user?.name ?? '社区管理员')
  }
}
