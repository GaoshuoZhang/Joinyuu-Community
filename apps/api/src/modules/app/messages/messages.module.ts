import { Module } from '@nestjs/common'
import { AppMessagesController } from './messages.controller'
import { AppMessagesService } from './messages.service'

/* 用户留言模块（M2-R R4 /api/app/me/messages）：提交与我的留言（含后台回复）。
 * 依赖 PrismaService / IdGeneratorService 为全局模块，无需额外 imports。 */
@Module({
  controllers: [AppMessagesController],
  providers: [AppMessagesService],
})
export class AppMessagesModule {}
