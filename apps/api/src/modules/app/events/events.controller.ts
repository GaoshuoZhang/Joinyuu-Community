import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppEventsService } from './events.service'
import { CheckInDto } from './dto/check-in.dto'
import { SubmitFeedbackDto } from './dto/submit-feedback.dto'

/* 活动中心（M2-R R2）：浏览/详情公开（游客可看），报名/取消/签到/反馈需登录 */
@Controller('api/app/events')
export class AppEventsController {
  constructor(private readonly events: AppEventsService) {}

  @Public()
  @Get()
  list(
    @Req() req: AppAuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.events.list(req.headers.authorization, this.page(page), this.page(pageSize, 10), type, keyword)
  }

  @Public()
  @Get(':id')
  detail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.events.detail(req.headers.authorization, id)
  }

  @HttpCode(200)
  @Post(':id/enroll')
  enroll(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.events.enroll(this.uid(req), id)
  }

  @HttpCode(200)
  @Post(':id/enroll/cancel')
  cancel(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.events.cancel(this.uid(req), id)
  }

  @HttpCode(200)
  @Post(':id/check-in')
  checkIn(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: CheckInDto) {
    return this.events.checkIn(this.uid(req), id, dto)
  }

  @Get(':id/feedback')
  feedback(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.events.getMyFeedback(this.uid(req), id)
  }

  @HttpCode(200)
  @Post(':id/feedback')
  submitFeedback(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.events.submitFeedback(this.uid(req), id, dto)
  }

  @Get(':id/ticket')
  ticket(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.events.myTicketByEvent(this.uid(req), id)
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }

  private page(raw?: string, fallback = 1): number {
    const n = Number.parseInt(raw ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }
}

/* 我的报名与电子票（M2-R R2）：归并到 me 前缀，与 meet 契约一致 */
@Controller('api/app/me')
export class AppMeEnrollmentsController {
  constructor(private readonly events: AppEventsService) {}

  @Get('enrollments')
  myEnrollments(@Req() req: AppAuthenticatedRequest) {
    return this.events.myEnrollments(this.uid(req))
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }
}
