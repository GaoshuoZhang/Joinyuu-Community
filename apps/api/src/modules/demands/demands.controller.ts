import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { DemandsService, type DemandDto, type UndertakerOptionDto } from './demands.service'
import { TakedownDto } from '../../common/dto/takedown.dto'
import { QueryDemandsDto } from './dto/query-demands.dto'
import { CreateDemandDto } from './dto/create-demand.dto'
import { UpdateDemandDto } from './dto/update-demand.dto'
import { RejectDemandDto } from './dto/reject-demand.dto'
import { ScheduleDemandDto } from './dto/schedule-demand.dto'
import { CloseDemandDto } from './dto/close-demand.dto'
import { ProxyRespondDemandDto } from './dto/proxy-respond-demand.dto'
import { InitiateProjectDto } from './dto/initiate-project.dto'

@Controller('api/admin/demands')
export class DemandsController {
  constructor(private readonly demands: DemandsService) {}

  /* 承接方选项供需求/项目两域表单复用 */
  @RequirePermission(['/demands', '/projects'])
  @Get('undertaker-options')
  undertakerOptions(): Promise<UndertakerOptionDto[]> {
    return this.demands.undertakerOptions()
  }

  /* 需求审核页与需求管理页共用列表/详情；两码任一即可 */
  @RequirePermission(['/demands', '/demands/review'])
  @Get()
  findAll(@Query() query: QueryDemandsDto): Promise<{ list: DemandDto[]; total: number }> {
    return this.demands.findAll(query)
  }

  @RequirePermission(['/demands', '/demands/review'])
  @Get(':id')
  findOne(@Param('id') id: string): Promise<DemandDto> {
    return this.demands.findOne(id)
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post()
  create(@Body() dto: CreateDemandDto, @Req() req: AuthenticatedRequest): Promise<DemandDto> {
    return this.demands.create(dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDemandDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.demands.update(id, dto, req.user?.name ?? '社区管理员')
  }

  /* 审核对话框在需求列表/详情/审核页共用，两码任一即可 */
  @RequirePermission(['/demands', '/demands/review'])
  @HttpCode(200)
  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.approve(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission(['/demands', '/demands/review'])
  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDemandDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.demands.reject(id, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/publish-now')
  publishNow(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.publishNow(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/schedule')
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleDemandDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.demands.schedule(id, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/cancel-schedule')
  cancelSchedule(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.cancelSchedule(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/retract')
  retract(@Param('id') id: string, @Body() dto: TakedownDto, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.retract(id, req.user?.name ?? '社区管理员', dto.takedownReason)
  }

  @RequirePermission('/demands')
  @Patch(':id/status')
  close(
    @Param('id') id: string,
    @Body() dto: CloseDemandDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.demands.close(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.archive(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/proxy-respond')
  proxyRespond(@Param('id') id: string, @Body() dto: ProxyRespondDemandDto): Promise<{ code: number }> {
    return this.demands.proxyRespond(id, dto)
  }

  @RequirePermission('/demands')
  @HttpCode(200)
  @Post(':id/initiate-project')
  initiateProject(
    @Param('id') id: string,
    @Body() dto: InitiateProjectDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.demands.initiateProject(id, dto, req.user?.name ?? '社区管理员')
  }
}
