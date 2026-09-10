import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import { WorkstationsService, type LeaseDto } from './workstations.service'
import { LeasePayloadDto } from './dto/lease-payload.dto'
import { LeaseUpdateDto } from './dto/lease-update.dto'

@Controller('api/admin/workstation-leases')
export class WorkstationLeasesController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get()
  findLeases(): Promise<LeaseDto[]> {
    return this.workstations.findLeases()
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: LeasePayloadDto): Promise<LeaseDto> {
    return this.workstations.createLease(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: LeaseUpdateDto): Promise<{ code: number }> {
    return this.workstations.updateLease(id, dto)
  }

  @HttpCode(200)
  @Post(':id/terminate')
  terminate(@Param('id') id: string): Promise<{ code: number }> {
    return this.workstations.terminateLease(id)
  }
}
