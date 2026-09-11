import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { SpacesService, type SpaceDto, type SpaceOccupancy, type ReservationDto } from './spaces.service'
import { SpacePayloadDto } from './dto/space-payload.dto'
import { SpaceStatusDto } from './dto/space-status.dto'

@RequirePermission('/spaces')
@Controller('api/admin/spaces')
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  findAll(): Promise<SpaceDto[]> {
    return this.spaces.findAll()
  }

  /* 静态路由须先于 :id 声明 */
  @Get('usage-board')
  usageBoard(@Query('date') date: string): Promise<SpaceOccupancy[]> {
    return this.spaces.usageBoard(date)
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<SpaceDto & { reservations: ReservationDto[] }> {
    return this.spaces.findOne(id)
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: SpacePayloadDto): Promise<SpaceDto> {
    return this.spaces.createSpace(dto)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: SpacePayloadDto): Promise<{ code: number }> {
    return this.spaces.updateSpace(id, dto)
  }

  @HttpCode(200)
  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SpaceStatusDto): Promise<{ code: number }> {
    return this.spaces.setSpaceStatus(id, dto.status)
  }
}
