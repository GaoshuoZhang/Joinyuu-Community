import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { ApplicationsService } from './applications.service'
import { QueryApplicationsDto } from './dto/query-applications.dto'
import { ReviewApplicationDto } from './dto/review-application.dto'
import { ApplicationFormConfigDto } from './dto/application-form-config.dto'

@RequirePermission('/approvals')
@Controller('api/admin/applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  findAll(@Query() query: QueryApplicationsDto) {
    return this.applications.findAll(query)
  }

  @Get('form-configs/all')
  formConfigs() {
    return this.applications.formConfigs()
  }

  @HttpCode(200)
  @Post('form-configs/:type')
  saveFormConfig(
    @Param('type') type: string,
    @Body() dto: ApplicationFormConfigDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.applications.saveFormConfig(type, dto, req.user?.name ?? '社区管理员')
  }

  /** 审核单打印数据 */
  @Get(':id/print')
  print(@Param('id') id: string) {
    return this.applications.print(id)
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

  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.applications.archive(id, req.user?.name ?? '社区管理员')
  }
}
