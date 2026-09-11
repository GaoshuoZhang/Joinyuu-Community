import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { ExternalEnterprisesService, type ExternalEnterpriseDto } from './external-enterprises.service'
import { QueryExternalEnterprisesDto } from './dto/query-external-enterprises.dto'
import { CreateExternalEnterpriseDto } from './dto/create-external-enterprise.dto'
import { UpdateExternalEnterpriseDto } from './dto/update-external-enterprise.dto'
import { ExternalEnterpriseMemberDto } from './dto/external-enterprise-member.dto'

@Controller('api/admin/external-enterprises')
export class ExternalEnterprisesController {
  constructor(private readonly externalEnterprises: ExternalEnterprisesService) {}

  @RequirePermission('/external-enterprises')
  @Get()
  list(@Query() query: QueryExternalEnterprisesDto): Promise<{ list: ExternalEnterpriseDto[]; total: number }> {
    return this.externalEnterprises.list(query)
  }

  @RequirePermission('perm:external-enterprise:create')
  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateExternalEnterpriseDto): Promise<{ id: string }> {
    return this.externalEnterprises.create(dto)
  }

  @RequirePermission('/external-enterprises')
  @Get(':id')
  detail(@Param('id') id: string): Promise<ExternalEnterpriseDto> {
    return this.externalEnterprises.detail(id)
  }

  @RequirePermission('/external-enterprises')
  @Get(':id/stats')
  stats(@Param('id') id: string): Promise<{ demandCount: number; projectCount: number }> {
    return this.externalEnterprises.stats(id)
  }

  @RequirePermission('perm:external-enterprise:update')
  @Put(':id')
  @HttpCode(200)
  update(@Param('id') id: string, @Body() dto: UpdateExternalEnterpriseDto): Promise<{ code: number }> {
    return this.externalEnterprises.update(id, dto)
  }

  @RequirePermission('perm:external-enterprise:disable')
  @Post(':id/disable')
  @HttpCode(200)
  disable(@Param('id') id: string): Promise<{ code: number }> {
    return this.externalEnterprises.disable(id)
  }

  @RequirePermission('perm:external-enterprise:enable')
  @Post(':id/enable')
  @HttpCode(200)
  enable(@Param('id') id: string): Promise<{ code: number }> {
    return this.externalEnterprises.enable(id)
  }

  @RequirePermission('perm:external-enterprise:delete')
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.externalEnterprises.remove(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('perm:external-enterprise:update')
  @Post(':id/members')
  @HttpCode(200)
  addMember(@Param('id') id: string, @Body() dto: ExternalEnterpriseMemberDto): Promise<{ code: number }> {
    return this.externalEnterprises.addMember(id, dto)
  }

  @RequirePermission('perm:external-enterprise:update')
  @Delete(':id/members/:userId')
  @HttpCode(200)
  removeMember(@Param('id') id: string, @Param('userId') userId: string): Promise<{ code: number }> {
    return this.externalEnterprises.removeMember(id, userId)
  }
}