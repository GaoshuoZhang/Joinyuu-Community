import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { SpacesService, type SpaceDto, type SpaceEventOccupancyDto, type SpaceOccupancy, type ReservationDto } from './spaces.service'
import { SpacePayloadDto } from './dto/space-payload.dto'
import { SpaceStatusDto } from './dto/space-status.dto'
import { UsageBoardQueryDto } from './dto/usage-board-query.dto'

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
  usageBoard(@Query() query: UsageBoardQueryDto): Promise<SpaceOccupancy[]> {
    return this.spaces.usageBoard(query.date)
  }

  /* 空间的活动占用明细（详情页日历/清单用；已发布活动按日展开） */
  @Get(':id/event-occupancy')
  eventOccupancy(@Param('id') id: string): Promise<SpaceEventOccupancyDto[]> {
    return this.spaces.eventOccupancy(id)
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
