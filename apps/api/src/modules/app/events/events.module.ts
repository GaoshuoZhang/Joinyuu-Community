import { Module } from '@nestjs/common'
import { AppEventsController, AppMeEnrollmentsController } from './events.controller'
import { AppEventsService } from './events.service'

/* 活动中心（M2-R R2，/api/app/events + /api/app/me/enrollments）：
 * 浏览/详情/报名/取消/电子签到/活动反馈 + 我的报名与电子票。
 * 依赖均为全局模块（Prisma/IdGenerator/PointsEngine/Notification），无需额外 imports。 */
@Module({
  controllers: [AppEventsController, AppMeEnrollmentsController],
  providers: [AppEventsService],
})
export class AppEventsModule {}