import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { WorkstationsService, type LeaseDto } from './workstations.service'
import { LeasePayloadDto } from './dto/lease-payload.dto'
import { LeaseUpdateDto } from './dto/lease-update.dto'

@RequirePermission('/workstations/leases')
@Controller('api/admin/workstation-leases')
export class WorkstationLeasesController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get()
  findLeases(): Promise<LeaseDto[]> {
    return this.workstations.findLeases()
  }

  @Get(':id')
  leaseDetail(@Param('id') id: string): Promise<LeaseDto> {
    return this.workstations.leaseDetail(id)
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: LeasePayloadDto): Promise<LeaseDto> {
    return this.workstations.createLease(dto)
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: LeaseUpdateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.workstations.updateLease(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/terminate')
  terminate(@Param('id') id: string): Promise<{ code: number }> {
    return this.workstations.terminateLease(id)
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.workstations.archive(id, req.user?.name ?? '社区管理员')
  }
}
