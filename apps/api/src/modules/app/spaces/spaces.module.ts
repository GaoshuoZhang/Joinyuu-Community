import { Module } from '@nestjs/common'
import { AppSpacesController } from './spaces.controller'
import { AppSpacesService } from './spaces.service'

/* 空间预约（M2-R R2 /api/app/spaces）：浏览、可用时段、提交预约（规则+冲突预检）、我的预约与取消。
 * 依赖均为全局模块（Prisma/IdGenerator/Notification）。 */
@Module({
  controllers: [AppSpacesController],
  providers: [AppSpacesService],
})
export class AppSpacesModule {}