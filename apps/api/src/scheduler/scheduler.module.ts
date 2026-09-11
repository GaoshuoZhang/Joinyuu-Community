import { Module } from '@nestjs/common'
import { SchedulerService } from './scheduler.service'
import { TrashModule } from '../modules/system/trash/trash.module'

/* 定时任务模块：仅声明 SchedulerService（@Cron 装饰的定时任务）。
 * ScheduleModule.forRoot() 由 app.module.ts 统一注册（lead 职责），本模块不重复导入。
 * 归档自动任务复用 TrashModule 的自动归档/自动删除能力。 */
@Module({
  imports: [TrashModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
