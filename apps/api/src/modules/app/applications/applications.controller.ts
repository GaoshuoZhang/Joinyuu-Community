import { Body, Controller, Get, HttpCode, Param, Post, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppApplicationsService, type ApplicationFormSchemaDto, type MyApplicationDto } from './applications.service'
import { CreateApplicationDto } from './dto/create-application.dto'

@Controller('api/app')
export class AppApplicationsController {
  constructor(private readonly applications: AppApplicationsService) {}

  /** 申请表单 schema 下发 */
  @Get('application-form/:type')
  formSchema(@Param('type') type: string): Promise<ApplicationFormSchemaDto> {
    return this.applications.formSchema(type)
  }

  /** 提交申请（schema 驱动字段 + 附件；→ 管理端申请审核） */
  @HttpCode(200)
  @Post('applications')
  create(@Req() req: AppAuthenticatedRequest, @Body() dto: CreateApplicationDto): Promise<{ id: string }> {
    const user = { uid: this.check(req), name: req.user?.name ?? '未命名' }
    return this.applications.create(user, dto)
  }

  /** 我的申请（含审核时间线） */
  @Get('me/applications')
  myApplications(@Req() req: AppAuthenticatedRequest): Promise<MyApplicationDto[]> {
    return this.applications.myApplications(this.check(req))
  }

  /** 撤回审核中的申请 */
  @HttpCode(200)
  @Post('me/applications/:id/withdraw')
  withdraw(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<{ code: number }> {
    return this.applications.withdraw(this.check(req), id)
  }

  /** 修改重提（可补充材料） */
  @HttpCode(200)
  @Post('me/applications/:id/resubmit')
  resubmit(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateApplicationDto): Promise<{ code: number }> {
    return this.applications.resubmit(this.check(req), id, dto)
  }

  /** 重提前回填申请原始载荷 */
  @Get('me/applications/:id/payload')
  payload(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<CreateApplicationDto> {
    return this.applications.payload(this.check(req), id)
  }

  private check(req: AppAuthenticatedRequest): string {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return payload.sub
  }
}
