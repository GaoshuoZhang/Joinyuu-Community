import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import { NotificationsService } from './notifications.service'

@Controller('api/admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll() {
    return this.notifications.findAll()
  }

  @HttpCode(200)
  @Post(':id/read')
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id)
  }

  @HttpCode(200)
  @Post('read-all')
  markAllRead() {
    return this.notifications.markAllRead()
  }
}
