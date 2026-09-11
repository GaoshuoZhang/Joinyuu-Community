import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { WorkstationsService, type WorkstationDto } from './workstations.service'
import { WorkstationPayloadDto } from './dto/workstation-payload.dto'
import { WorkstationStatusDto } from './dto/workstation-status.dto'

@RequirePermission('/workstations')
@Controller('api/admin/workstations')
export class WorkstationsController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get()
  findAll(): Promise<WorkstationDto[]> {
    return this.workstations.findAll()
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: WorkstationPayloadDto): Promise<WorkstationDto> {
    return this.workstations.createWorkstation(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: WorkstationPayloadDto): Promise<{ code: number }> {
    return this.workstations.updateWorkstation(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ code: number }> {
    return this.workstations.deleteWorkstation(id)
  }

  @HttpCode(200)
  @Post(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: WorkstationStatusDto,
  ): Promise<{ code: number }> {
    return this.workstations.setWorkstationStatus(id, dto.status)
  }
}
