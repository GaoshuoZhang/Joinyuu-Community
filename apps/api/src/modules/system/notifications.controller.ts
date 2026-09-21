import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { NotificationsService } from './notifications.service'

@RequirePermission('/system/messages')
@Controller('api/admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.notifications.findAll(req.user?.sub)
  }

  @HttpCode(200)
  @Post(':id/read')
  markRead(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.notifications.markRead(id, req.user?.sub)
  }

  @HttpCode(200)
  @Post('read-all')
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user?.sub)
  }
}