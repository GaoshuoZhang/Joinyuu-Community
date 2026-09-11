import { Module } from '@nestjs/common'
import { SchedulerModule } from '../../../scheduler/scheduler.module'
import { MonitorController } from './monitor.controller'
import { MonitorService } from './monitor.service'

/* 系统监控 */
@Module({
  imports: [SchedulerModule],
  controllers: [MonitorController],
  providers: [MonitorService],
})
export class MonitorModule {}
