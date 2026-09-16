import { Global, Module } from '@nestjs/common'
import { NotificationService } from './notification.service'

/** 站内信统一下发（M2-R R1：UserNotification 写入 + 通知偏好过滤） */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}