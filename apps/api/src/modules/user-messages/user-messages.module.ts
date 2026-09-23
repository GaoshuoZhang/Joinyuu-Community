import { Module } from '@nestjs/common'
import { UserMessagesController } from './user-messages.controller'
import { UserMessagesService } from './user-messages.service'

/* 用户留言模块（M2-R R4 /api/admin/user-messages）：后台查看与回复客户端留言。
 * 依赖 PrismaService / NotificationService 均为全局模块，无需额外 imports。 */
@Module({
  controllers: [UserMessagesController],
  providers: [UserMessagesService],
})
export class UserMessagesModule {}
