import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { NoticesService, type NoticesPageDto } from './notices.service'
import { NoticePrefsDto } from './dto/notice-prefs.dto'

/* 站内信读写（M2-R R1，/api/app/notices）：
 * 列表/未读数/标记已读/全部已读/归档；均基于登录用户（req.user.sub）隔离 */
@Controller('api/app/notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  list(
    @Req() req: AppAuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ): Promise<NoticesPageDto> {
    return this.notices.list(
      this.uid(req),
      this.toInt(page, 1),
      this.toInt(pageSize, 10, [1, 50]),
      status,
      type,
    )
  }

  @Get('unread-count')
  unreadCount(@Req() req: AppAuthenticatedRequest): Promise<{ count: number }> {
    return this.notices.unreadCount(this.uid(req))
  }

  @HttpCode(200)
  @Post(':id/read')
  markRead(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ code: number }> {
    return this.notices.markRead(this.uid(req), id)
  }

  @HttpCode(200)
  @Post('read-all')
  markAllRead(@Req() req: AppAuthenticatedRequest): Promise<{ code: number }> {
    return this.notices.markAllRead(this.uid(req))
  }

  @HttpCode(200)
  @Post(':id/archive')
  archive(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body('archived') archived: boolean,
  ): Promise<{ code: number }> {
    return this.notices.archive(this.uid(req), id, archived === true)
  }

  private uid(req: AppAuthenticatedRequest): string {
    /* AppJwtGuard 已保证 /api/app/** 下 req.user 存在；此处防御性兜底 */
    return req.user?.sub ?? ''
  }

  private toInt(raw: string | undefined, fallback: number, range?: [number, number]): number {
    const n = Number(raw)
    if (!Number.isInteger(n) || n <= 0) return fallback
    if (range && n > range[1]) return range[1]
    return n
  }
}

/* 通知偏好（M2-R R1，/api/app/me/notices/prefs） */
@Controller('api/app/me/notices')
export class MeNoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get('prefs')
  getPrefs(@Req() req: AppAuthenticatedRequest): Promise<{ enabledTypes: string[] }> {
    return this.notices.getPrefs(this.uid(req))
  }

  @Put('prefs')
  updatePrefs(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: NoticePrefsDto,
  ): Promise<{ code: number }> {
    return this.notices.updatePrefs(this.uid(req), dto)
  }

  private uid(req: AppAuthenticatedRequest): string {
    return req.user?.sub ?? ''
  }
}