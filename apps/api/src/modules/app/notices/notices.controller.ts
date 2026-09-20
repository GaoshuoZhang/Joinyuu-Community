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
import { PageQueryDto } from '../../../common/dto/page-query.dto'
import { NoticesService, type NoticesPageDto, type NoticePreferencesDto } from './notices.service'
import { UpdateNoticePreferencesDto } from './dto/update-preferences.dto'

/* 站内信读写（M2-R R1，/api/app/notices）：
 * 列表/未读数/标记已读/全部已读；均基于登录用户（req.user.sub）隔离 */
@Controller('api/app/notices')
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  @Get()
  list(
    @Req() req: AppAuthenticatedRequest,
    @Query() query: PageQueryDto,
  ): Promise<NoticesPageDto> {
    return this.notices.list(this.uid(req), query.page, query.pageSize)
  }

  @Get('unread-count')
  unreadCount(@Req() req: AppAuthenticatedRequest): Promise<{ count: number }> {
    return this.notices.unreadCount(this.uid(req))
  }

  /** 通知偏好：类型目录 + 当前静音集合 */
  @Get('preferences')
  preferences(@Req() req: AppAuthenticatedRequest): Promise<NoticePreferencesDto> {
    return this.notices.preferences(this.uid(req))
  }

  /** 保存静音集合（仅可配置类型；system 等安全通知不可静音） */
  @Put('preferences')
  updatePreferences(
    @Req() req: AppAuthenticatedRequest,
    @Body() dto: UpdateNoticePreferencesDto,
  ): Promise<NoticePreferencesDto> {
    return this.notices.updatePreferences(this.uid(req), dto.mutedTypes)
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

  private uid(req: AppAuthenticatedRequest): string {
    /* AppJwtGuard 已保证 /api/app/** 下 req.user 存在；此处防御性兜底 */
    return req.user?.sub ?? ''
  }
}
