import { Module } from '@nestjs/common'
import { NoticesController } from './notices.controller'
import { NoticesService } from './notices.service'

/* App 端站内信（M2-R R1，/api/app/**）：
 * 本模块提供站内信列表/未读数/标记已读/全部已读；通知由各业务域接线。 */
@Module({
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class AppNoticesModule {}
