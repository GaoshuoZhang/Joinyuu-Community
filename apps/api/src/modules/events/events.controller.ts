import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { EventsService } from './events.service'
import { QueryEventsDto } from './dto/query-events.dto'
import { QueryEnrollmentsDto } from './dto/query-enrollments.dto'
import { EventPayloadDto } from './dto/event-payload.dto'
import { ScheduleEventDto } from './dto/schedule-event.dto'
import { ReviewEnrollmentDto } from './dto/review-enrollment.dto'
import { CheckinEventDto } from './dto/checkin-event.dto'
import { RescheduleEventDto } from './dto/reschedule-event.dto'
import { RedeemTicketDto } from './dto/redeem-ticket.dto'
import { UpdateEnrollmentDto } from './dto/update-enrollment.dto'

@RequirePermission('/events')
@Controller('api/admin/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  findAll(@Query() query: QueryEventsDto) {
    return this.events.findAll(query)
  }

  /* 静态路径须先于 :id 注册，避免被参数路由吞掉 */
  @Get('enrollments')
  listEnrollments(@Query() query: QueryEnrollmentsDto) {
    return this.events.listEnrollments(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.events.findOne(id)
  }

  @HttpCode(200)
  @Post()
  create(@Body() dto: EventPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.events.create(dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: EventPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.events.update(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/publish-now')
  publishNow(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.publishNow(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/schedule')
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.events.schedule(id, dto.scheduledAt, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/cancel-schedule')
  cancelSchedule(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.cancelSchedule(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Patch(':id/enrollment')
  setEnrollment(
    @Param('id') id: string,
    @Body() dto: UpdateEnrollmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.events.setEnrollment(id, dto.enrollmentOpen, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.cancel(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/restore')
  restore(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.restore(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/reschedule')
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleEventDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.events.reschedule(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.events.archive(id, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':id/enrollments/:userId/review')
  reviewEnrollment(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: ReviewEnrollmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.events.reviewEnrollment(id, userId, dto.status, req.user?.name ?? '社区管理员', dto.reason)
  }

  @HttpCode(200)
  @Post(':id/checkin')
  checkin(@Param('id') id: string, @Body() dto: CheckinEventDto) {
    return this.events.checkin(id, dto.userId)
  }

  @Get(':id/tickets')
  tickets(@Param('id') id: string) {
    return this.events.listTickets(id)
  }

  @HttpCode(200)
  @Post(':id/tickets/redeem')
  redeemTicket(@Param('id') id: string, @Body() dto: RedeemTicketDto) {
    return this.events.redeemTicket(id, dto.code)
  }
}
