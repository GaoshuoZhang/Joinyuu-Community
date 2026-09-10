import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { EventsService } from './events.service'
import { QueryEventsDto } from './dto/query-events.dto'
import { EventPayloadDto } from './dto/event-payload.dto'
import { ScheduleEventDto } from './dto/schedule-event.dto'
import { ReviewEnrollmentDto } from './dto/review-enrollment.dto'
import { CheckinEventDto } from './dto/checkin-event.dto'

@Controller('api/admin/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  findAll(@Query() query: QueryEventsDto) {
    return this.events.findAll(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.events.findOne(id)
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: EventPayloadDto) {
    return this.events.create(dto)
  }

  @HttpCode(200)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: EventPayloadDto) {
    return this.events.update(id, dto)
  }

  @HttpCode(200)
  @Post(':id/publish-now')
  publishNow(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.publishNow(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleEventDto) {
    return this.events.schedule(id, dto.scheduledAt)
  }

  @HttpCode(200)
  @Post(':id/cancel-schedule')
  cancelSchedule(@Param('id') id: string) {
    return this.events.cancelSchedule(id)
  }

  @HttpCode(200)
  @Patch(':id/enrollment')
  toggleEnrollment(@Param('id') id: string) {
    return this.events.toggleEnrollment(id)
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.cancel(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.events.restore(id)
  }

  @HttpCode(200)
  @Post(':id/enrollments/:userId/review')
  reviewEnrollment(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: ReviewEnrollmentDto,
  ) {
    return this.events.reviewEnrollment(id, userId, dto.status)
  }

  @HttpCode(200)
  @Post(':id/checkin')
  checkin(@Param('id') id: string, @Body() dto: CheckinEventDto) {
    return this.events.checkin(id, dto.userId)
  }
}
