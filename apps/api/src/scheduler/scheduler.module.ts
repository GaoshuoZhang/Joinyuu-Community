import { Module } from '@nestjs/common'
import { SchedulerService } from './scheduler.service'

/* 定时任务模块：仅声明 SchedulerService（@Cron 装饰的定时任务）。
 * ScheduleModule.forRoot() 由 app.module.ts 统一注册（lead 职责），本模块不重复导入。 */
@Module({
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
