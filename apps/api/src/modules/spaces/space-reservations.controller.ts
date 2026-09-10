import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { SpacesService, type ReservationDto } from './spaces.service'
import { QueryReservationsDto } from './dto/query-reservations.dto'
import { ReviewReservationDto } from './dto/review-reservation.dto'

@Controller('api/admin/space-reservations')
export class SpaceReservationsController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  findAll(@Query() query: QueryReservationsDto): Promise<{ list: ReservationDto[]; total: number }> {
    return this.spaces.findReservations(query)
  }

  @HttpCode(200)
  @Post(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewReservationDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.spaces.reviewReservation(id, dto.status, dto.comment, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id') id: string): Promise<{ code: number }> {
    return this.spaces.cancelReservation(id)
  }
}
