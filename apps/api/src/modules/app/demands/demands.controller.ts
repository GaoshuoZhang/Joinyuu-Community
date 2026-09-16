import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { Public } from '../../../common/decorators/public.decorator'
import { AppDemandsService } from './demands.service'
import { CreateDemandDto } from './dto/create-demand.dto'
import { RespondDemandDto } from './dto/respond-demand.dto'
import { ReviewResponseDto } from './dto/review-response.dto'
import { DemandMessageDto } from './dto/demand-message.dto'

/* 需求广场（M2-R R2，/api/app/demands + /me/demands、/me/responses）：
 * 浏览（@Public 免登录，联系人仅登录可见）、提交、响应、撤回/重提/申诉、发布者审阅响应立项。 */
@Controller('api/app')
export class AppDemandsController {
  constructor(private readonly demands: AppDemandsService) {}

  @Public()
  @Get('demands')
  list(
    @Query('kind') kind?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Req() req?: AppAuthenticatedRequest,
  ) {
    return this.demands.list(
      {
        kind,
        category,
        keyword,
        page: parseInt(page ?? '1', 10) || 1,
        pageSize: Math.min(50, parseInt(pageSize ?? '10', 10) || 10),
      },
      req!,
    )
  }

  @Public()
  @Get('demands/:id')
  detail(@Param('id') id: string, @Req() req?: AppAuthenticatedRequest) {
    return this.demands.detail(id, req!)
  }

  @HttpCode(200)
  @Post('demands')
  create(@Req() req: AppAuthenticatedRequest, @Body() dto: CreateDemandDto) {
    return this.demands.create(this.uid(req), this.name(req), dto)
  }

  @Get('me/demands')
  myDemands(@Req() req: AppAuthenticatedRequest, @Query('status') status?: string) {
    return this.demands.myDemands(this.uid(req), status)
  }

  @HttpCode(200)
  @Post('demands/:id/respond')
  respond(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: RespondDemandDto) {
    return this.demands.respond(this.uid(req), id, dto)
  }

  @Get('me/responses')
  myResponses(@Req() req: AppAuthenticatedRequest) {
    return this.demands.myResponses(this.uid(req))
  }

  @HttpCode(200)
  @Post('me/responses/:id/withdraw')
  withdrawResponse(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.demands.withdrawResponse(this.uid(req), id)
  }

  @Get('me/demands/:id/responses')
  demandResponses(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.demands.demandResponses(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/demands/:id/responses/:responseId/review')
  reviewResponse(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Param('responseId') responseId: string,
    @Body() dto: ReviewResponseDto,
  ) {
    return this.demands.reviewResponse(this.uid(req), id, responseId, dto)
  }

  @HttpCode(200)
  @Post('me/demands/:id/withdraw')
  withdrawDemand(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.demands.withdrawDemand(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/demands/:id/resubmit')
  resubmit(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateDemandDto) {
    return this.demands.resubmitDemand(this.uid(req), id, dto)
  }

  @Get('me/demands/:id/payload')
  payload(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.demands.demandPayload(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('me/demands/:id/appeal')
  appeal(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: { reason?: string }) {
    return this.demands.appealDemand(this.uid(req), id, dto?.reason ?? '')
  }

  @Get('demands/:id/messages')
  messages(@Req() req: AppAuthenticatedRequest, @Param('id') id: string) {
    return this.demands.listMessages(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('demands/:id/messages')
  postMessage(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: DemandMessageDto) {
    return this.demands.postMessage(this.uid(req), this.name(req), id, dto)
  }

  private uid(req: AppAuthenticatedRequest): string {
    const u = req.user
    if (!u) throw new ForbiddenException('未登录或登录已过期')
    return u.sub
  }

  private name(req: AppAuthenticatedRequest): string {
    return req.user?.name ?? ''
  }
}
