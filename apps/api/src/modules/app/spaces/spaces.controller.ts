import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common'
import { Public } from '../../../common/decorators/public.decorator'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppSpacesService, type MyReservationDetailDto, type MyReservationDto, type SpaceDto, type SpaceSlotDto } from './spaces.service'
import { CreateReservationDto } from './dto/create-reservation.dto'

/* 空间：列表/详情/可用时段为游客可访问（移动端空间页无登录门槛），预约类端点需登录。 */
@Controller('api/app')
export class AppSpacesController {
  constructor(private readonly spaces: AppSpacesService) {}

  /** 可预约空间列表（维护中剔除） */
  @Public()
  @Get('spaces')
  list(): Promise<SpaceDto[]> {
    return this.spaces.list()
  }

  /** 空间详情（不可约/不存在 404） */
  @Public()
  @Get('spaces/:id')
  detail(@Param('id') id: string): Promise<SpaceDto> {
    return this.spaces.detail(id)
  }

  /** 某日可用时段（待审核/已通过预约 + 已发布活动占用） */
  @Public()
  @Get('spaces/:id/availability')
  availability(@Param('id') id: string, @Query('date') date?: string): Promise<SpaceSlotDto[]> {
    return this.spaces.availability(id, date ?? '')
  }

  /** 提交预约（开放时段校验 + 冲突预检 409 + 费用扣分；needApproval 进 pending） */
  @Post('spaces/reservations')
  create(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: CreateReservationDto,
  ): Promise<{ status: 'pending' | 'approved'; pointsSpent: number }> {
    return this.spaces.create(this.user(req), dto)
  }

  /** 我的预约 */
  @Get('me/reservations')
  myReservations(@Req() req: AppAuthenticatedRequest): Promise<MyReservationDto[]> {
    return this.spaces.myReservations(this.user(req).uid)
  }

  /** 我的预约详情（仅预约人本人） */
  @Get('me/reservations/:id')
  myReservationDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<MyReservationDetailDto> {
    return this.spaces.myReservationDetail(this.user(req).uid, id)
  }

  /** 取消预约（pending/approved 可取消，已扣费用全额退回） */
  @HttpCode(200)
  @Post('spaces/reservations/:id/cancel')
  cancel(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<{ code: number }> {
    return this.spaces.cancel(this.user(req).uid, id)
  }

  private user(req: AppAuthenticatedRequest): { uid: string; name: string } {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return { uid: payload.sub, name: payload.name }
  }
}
