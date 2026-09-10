import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { DemandsService, type DemandDto, type UndertakerOptionDto } from './demands.service'
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

  @Get('undertaker-options')
  undertakerOptions(): Promise<UndertakerOptionDto[]> {
    return this.demands.undertakerOptions()
  }

  @Get()
  findAll(@Query() query: QueryDemandsDto): Promise<{ list: DemandDto[]; total: number }> {
    return this.demands.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<DemandDto> {
    return this.demands.findOne(id)
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: CreateDemandDto, @Req() req: AuthenticatedRequest): Promise<DemandDto> {
    return this.demands.create(dto, req.user?.name ?? '社区管理员')
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDemandDto): Promise<{ code: number }> {
    return this.demands.update(id, dto)
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.approve(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDemandDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.demands.reject(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/publish-now')
  publishNow(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.demands.publishNow(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleDemandDto): Promise<{ code: number }> {
    return this.demands.schedule(id, dto)
  }

  @HttpCode(200)
  @Post(':id/cancel-schedule')
  cancelSchedule(@Param('id') id: string): Promise<{ code: number }> {
    return this.demands.cancelSchedule(id)
  }

  @HttpCode(200)
  @Post(':id/retract')
  retract(@Param('id') id: string): Promise<{ code: number }> {
    return this.demands.retract(id)
  }

  @Patch(':id/status')
  close(
    @Param('id') id: string,
    @Body() dto: CloseDemandDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.demands.close(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/proxy-respond')
  proxyRespond(@Param('id') id: string, @Body() dto: ProxyRespondDemandDto): Promise<{ code: number }> {
    return this.demands.proxyRespond(id, dto)
  }

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
