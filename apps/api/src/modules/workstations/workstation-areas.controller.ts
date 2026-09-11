import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { WorkstationArea } from '@prisma/client'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { WorkstationsService } from './workstations.service'
import { WorkstationAreaPayloadDto } from './dto/workstation-area.dto'

@RequirePermission('/workstations/offices')
@Controller('api/admin/workstation-areas')
export class WorkstationAreasController {
  constructor(private readonly workstations: WorkstationsService) {}

  @Get()
  findAreas(): Promise<WorkstationArea[]> {
    return this.workstations.findAreas()
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: WorkstationAreaPayloadDto): Promise<WorkstationArea> {
    return this.workstations.createArea(dto)
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: WorkstationAreaPayloadDto,
  ): Promise<{ code: number }> {
    return this.workstations.updateArea(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ code: number }> {
    return this.workstations.deleteArea(id)
  }
}
