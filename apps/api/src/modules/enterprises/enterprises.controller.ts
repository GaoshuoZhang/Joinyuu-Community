import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { EnterprisesService, type EnterpriseDto } from './enterprises.service'
import { QueryEnterprisesDto } from './dto/query-enterprises.dto'
import { CreateEnterpriseDto } from './dto/create-enterprise.dto'
import { UpdateEnterpriseDto } from './dto/update-enterprise.dto'

@Controller('api/admin/enterprises')
export class EnterprisesController {
  constructor(private readonly enterprises: EnterprisesService) {}

  /* 选项端点供跨域表单复用，仅需登录（只返回 id+name） */
  @Get('options')
  options(): Promise<Array<{ label: string; value: string }>> {
    return this.enterprises.options()
  }

  @RequirePermission('/enterprises')
  @Get()
  list(@Query() query: QueryEnterprisesDto): Promise<{ list: EnterpriseDto[]; total: number }> {
    return this.enterprises.list(query)
  }

  @RequirePermission('perm:enterprise:create')
  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateEnterpriseDto): Promise<{ id: string }> {
    return this.enterprises.create(dto)
  }

  @RequirePermission('/enterprises')
  @Get(':id')
  detail(@Param('id') id: string): Promise<{ enterprise: EnterpriseDto; members: unknown }> {
    return this.enterprises.detail(id)
  }

  @RequirePermission('/enterprises')
  @Get(':id/stats')
  stats(@Param('id') id: string): Promise<{ demandCount: number; projectCount: number }> {
    return this.enterprises.stats(id)
  }

  @RequirePermission('perm:enterprise:update')
  @Put(':id')
  @HttpCode(200)
  update(@Param('id') id: string, @Body() dto: UpdateEnterpriseDto): Promise<{ code: number }> {
    return this.enterprises.update(id, dto)
  }

  @RequirePermission('perm:enterprise:disable')
  @Post(':id/disable')
  @HttpCode(200)
  disable(@Param('id') id: string): Promise<{ code: number }> {
    return this.enterprises.disable(id)
  }

  @RequirePermission('perm:enterprise:enable')
  @Post(':id/enable')
  @HttpCode(200)
  enable(@Param('id') id: string): Promise<{ code: number }> {
    return this.enterprises.enable(id)
  }

  @RequirePermission('perm:enterprise:delete')
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.enterprises.remove(id, req.user?.name ?? '社区管理员')
  }

}
