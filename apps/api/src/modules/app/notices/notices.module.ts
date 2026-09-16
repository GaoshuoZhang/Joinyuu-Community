import { Module } from '@nestjs/common'
import { MeNoticesController, NoticesController } from './notices.controller'
import { NoticesService } from './notices.service'

/* App 端站内信（M2-R R1，/api/app/**）：
 * 站内信列表/未读数/标记已读/全部已读/归档，及 me/notices 通知偏好。
 * 本模块仅读取站内信与通知偏好，不推通知（触发由 NotificationService 各处接线）。 */
@Module({
  controllers: [NoticesController, MeNoticesController],
  providers: [NoticesService],
})
export class AppNoticesModule {}